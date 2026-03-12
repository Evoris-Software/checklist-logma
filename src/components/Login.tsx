import { FormEvent, useState } from "react";
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserSessionPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  limit,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import Cookies from "js-cookie";
import { db, auth } from "../services/firebase";
import logoBranco from "../assets/logo-branco.png";

interface LoginProps {
  onLogin?: (nome: string, role?: string) => void;
}

async function buscarEmailPorNomeSeguro(nomeBuscado: string): Promise<string | "duplicado" | null> {
  try {
    const q = query(
      collection(db, "usuarios"),
      where("nome", "==", nomeBuscado),
      limit(2),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    if (snap.size > 1) return "duplicado";
    return (snap.docs[0].data() as { email?: string }).email ?? null;
  } catch (e) {
    console.error("Erro ao buscar email:", e);
    return null;
  }
}

async function obterDadosUsuarioPosAuth(
  uid: string,
  email: string | null,
  nomeDigitado: string,
) {
  if (email) {
    try {
      const qEmail = query(
        collection(db, "usuarios"),
        where("email", "==", email),
        limit(1),
      );
      const snapEmail = await getDocs(qEmail);
      if (!snapEmail.empty) return snapEmail.docs[0].data();
    } catch (e) {
      console.warn("Leitura por email bloqueada nas regras:", e);
    }
  }

  if (nomeDigitado) {
    try {
      const qNome = query(
        collection(db, "usuarios"),
        where("nome", "==", nomeDigitado),
        limit(1),
      );
      const snapNome = await getDocs(qNome);
      if (!snapNome.empty) return snapNome.docs[0].data();
    } catch (e) {
      console.warn("Leitura por nome bloqueada/sem acesso:", e);
    }
  }

  try {
    const refUid = doc(db, "usuarios", uid);
    const userDoc = await getDoc(refUid);
    if (userDoc.exists()) return userDoc.data();
  } catch (e) {
    console.warn("Leitura por uid bloqueada/sem acesso:", e);
  }

  return null;
}

export function Login({ onLogin }: LoginProps) {
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [manterLogado, setManterLogado] = useState(false);

  const [userData, setUserData] = useState<{
    uid: string;
    role?: string;
    nome?: string;
  } | null>(null);

  const navigate = useNavigate();

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    const nomeTrim = nome.trim();
    const senhaTrim = senha.trim();

    try {
      await setPersistence(
        auth,
        manterLogado ? browserLocalPersistence : browserSessionPersistence,
      );

      const email = await buscarEmailPorNomeSeguro(nomeTrim);
      if (!email) {
        setErro("Usuário não encontrado. Procure o administrador para verificar seu cadastro.");
        return;
      }
      if (email === "duplicado") {
        setErro("Nome duplicado. Procure o responsável para corrigir seu cadastro.");
        return;
      }

      const cred = await signInWithEmailAndPassword(auth, email, senhaTrim);
      const uid = cred.user.uid;
      const authEmail = cred.user.email || email;

      const dados = await obterDadosUsuarioPosAuth(uid, authEmail, nomeTrim);
      if (!dados) {
        setErro("Permissão insuficiente para ler seu cadastro. Avise o administrador.");
        return;
      }

      Cookies.set("usuarioUid", uid, { expires: 7 });

      setUserData({ uid, role: (dados as any).role, nome: (dados as any).nome });

      try {
        if (typeof onLogin === "function") {
          onLogin((dados as any).nome, (dados as any).role);
        }
      } catch {
        // noop
      }
      navigate("/");
      setSucesso("Login realizado com sucesso.");
    } catch (error: any) {
      if (error.code === "auth/wrong-password" || error.code === "auth/user-not-found") {
        setErro("Nome ou senha incorretos.");
      } else if (error.code === "auth/too-many-requests") {
        setErro("Muitas tentativas. Tente novamente em alguns minutos ou troque sua senha.");
      } else {
        setErro("Erro ao fazer login. Tente novamente ou contate o administrador.");
      }
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#050712] text-slate-100 px-4">
      <div className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 via-white/5 to-transparent px-6 py-7 shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur-xl">
        <div className="absolute inset-x-10 -top-6 h-20 rounded-full bg-gradient-to-r from-sky-500/40 via-emerald-500/40 to-sky-500/40 blur-3xl opacity-60" />

        <div className="relative z-10">
          <div className="flex justify-center mb-4">
            <img
              src={logoBranco}
              alt="Logma Transportes"
              className="h-16 w-auto drop-shadow-[0_4px_18px_rgba(0,0,0,0.8)]"
            />
          </div>

          <h1 className="text-center text-xl font-semibold tracking-wide text-slate-50 mb-5">
            Acesso Logma
          </h1>

          {erro && (
            <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              {erro}
            </div>
          )}
          {sucesso && (
            <div className="mb-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              {sucesso}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Nome
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                autoFocus
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 shadow-inner shadow-black/30 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/70 placeholder:text-slate-500"
                placeholder="Digite seu nome"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Senha
              </label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 shadow-inner shadow-black/30 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/70 placeholder:text-slate-500"
                placeholder="Digite sua senha"
              />
            </div>

            <label className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-300">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border border-white/30 bg-black/60 text-sky-500 focus:ring-sky-500/60"
                checked={manterLogado}
                onChange={() => setManterLogado((v) => !v)}
              />
              Manter logado neste dispositivo
            </label>

            <button
              type="submit"
              className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-sky-500 via-sky-400 to-emerald-400 px-4 py-2.5 text-sm font-semibold tracking-wide text-slate-950 shadow-lg shadow-sky-900/40 transition hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0"
            >
              Entrar
            </button>
          </form>

          <p className="mt-4 text-center text-[11px] text-slate-400">
            Problemas de acesso? Procure o administrador da Logma.
          </p>
        </div>
      </div>

      <footer className="mt-6 text-center text-[11px] text-slate-500">
        Powered by{" "}
        <a
          href="https://evoris.vip"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-sky-400 hover:text-sky-300"
        >
          Evoris
        </a>{" "}
        • {new Date().getFullYear()}
      </footer>
    </div>
  );
}

export default Login;

