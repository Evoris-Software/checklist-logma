import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User as FirebaseUser } from "firebase/auth";
import { auth, db } from "../services/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import type { AppUser, Role } from "../types";

interface AuthContextValue {
  user: FirebaseUser | null;
  role: Role | null;
  name: string | null;
  initializing: boolean;
  appUser: AppUser | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);

      if (u) {
        try {
          type UserDoc = Partial<AppUser> & { role?: Role; roles?: Role[]; nome?: string; Nome?: string };
          let dataByUid: UserDoc | null = null;
          let dataByEmail: UserDoc | null = null;

          // 1) Busca por UID (documento em usuarios/{uid})
          const userRef = doc(db, "usuarios", u.uid);
          const snap = await getDoc(userRef);
          if (snap.exists()) dataByUid = snap.data() as UserDoc;

          // 2) Busca por email: por ID do doc (usuarios/{email}) ou por query
          if (u.email) {
            const snapByEmailId = await getDoc(doc(db, "usuarios", u.email));
            if (snapByEmailId.exists()) {
              dataByEmail = snapByEmailId.data() as UserDoc;
            } else {
              const q = query(
                collection(db, "usuarios"),
                where("email", "==", u.email),
                limit(1),
              );
              const snapEmail = await getDocs(q);
              if (!snapEmail.empty) dataByEmail = snapEmail.docs[0].data() as UserDoc;
            }
          }

          // 3) Preferir o documento que tem nome e role (evita perder dados após relogin)
          const dUsuarios: UserDoc | null =
            dataByEmail ?? dataByUid ?? null;
          const preferNome = (dataByEmail?.nome ?? dataByEmail?.Nome ?? dataByUid?.nome ?? dataByUid?.Nome) as string | undefined;
          const preferRole = (dataByEmail?.role ?? dataByUid?.role) as Role | undefined;

          // Busca roles adicionais na coleção "perfis"
          const perfisSnap = await getDoc(doc(db, "perfis", u.uid));
          const perfisData = perfisSnap.exists()
            ? (perfisSnap.data() as { roles?: Role[]; role?: Role })
            : null;

          const rolesFromPerfis: Role[] = Array.isArray(perfisData?.roles)
            ? (perfisData?.roles as Role[])
            : perfisData?.role
            ? [perfisData.role as Role]
            : [];

          const primaryRole: Role | null =
            (preferRole as Role | undefined) ??
            (rolesFromPerfis[0] as Role | undefined) ??
            null;

          const mergedRoles: Role[] = Array.from(
            new Set(
              [
                ...(dUsuarios?.roles ?? []),
                ...rolesFromPerfis,
                primaryRole ?? undefined,
              ].filter(Boolean) as Role[],
            ),
          );

          const resolvedName =
            preferNome ||
            u.displayName ||
            (u.email ? u.email.split("@")[0] : null) ||
            "Usuário";

          if (dUsuarios || mergedRoles.length > 0) {
            setRole(primaryRole);
            setName(resolvedName);
            setAppUser({
              uid: u.uid,
              nome: resolvedName,
              email: u.email ?? undefined,
              role: primaryRole ?? "motorista",
              roles: mergedRoles,
            });
            try {
              // Sincroniza usuarios/{uid} com nome/role quando encontrado por email
              const toMerge: Record<string, unknown> = { lastSeenAt: serverTimestamp() };
              if (preferNome && !dataByUid?.nome) toMerge.nome = preferNome;
              if (preferRole && !dataByUid?.role) toMerge.role = preferRole;
              if (u.email && !dataByUid?.email) toMerge.email = u.email;
              await setDoc(userRef, toMerge, { merge: true });
            } catch {
              // noop: presença/sync é best-effort
            }
          } else {
            setRole(null);
            setName(null);
            setAppUser(null);
          }
        } catch {
          setRole(null);
          setName(null);
          setAppUser(null);
        }
      } else {
        setRole(null);
        setName(null);
        setAppUser(null);
      }

      setInitializing(false);
    });

    return () => unsub();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, name, initializing, appUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider");
  }
  return ctx;
}

