import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "../services/firebase";
import type { Role } from "../types";

interface UseUserRolesResult {
  roles: Role[];
  isAdmin: boolean;
  isMotorista: boolean;
  isVendedor: boolean;
  loading: boolean;
}

export function useUserRoles(): UseUserRolesResult {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        setRoles([]);
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "perfis", user.uid));
        const data = snap.exists() ? (snap.data() as { roles?: Role[] }) : {};
        setRoles(Array.isArray(data.roles) ? data.roles : []);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub?.();
  }, []);

  const isAdmin = roles.includes("admin");
  const isMotorista = roles.includes("motorista");
  const isVendedor = roles.includes("vendedor");

  return { roles, isAdmin, isMotorista, isVendedor, loading };
}

