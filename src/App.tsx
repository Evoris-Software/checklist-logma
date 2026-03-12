import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, useParams, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
import Login from "./components/Login";
import Home from "./pages/Home";
import Historico from "./pages/Historico";
import Checklist from "./pages/Checklist";
import NotFound from "./pages/NotFound";

const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const Manutencao = lazy(() => import("./pages/manutencao"));
const AbastecimentoDashboard = lazy(
  () => import("./components/abastecimento/DashboardAbastecimento"),
);
const LancarAbastecimento = lazy(
  () => import("./components/abastecimento/LancarAbastecimento"),
);
const MyAbastecimentos = lazy(
  () => import("./modules/abastecimento/MyAbastecimentos"),
);
const Dashboard = lazy(() => import("./pages/Dashboard"));

// Pré-carrega os chunks principais após o login
function preloadProtectedChunks() {
  void import("./pages/AdminPanel");
  void import("./pages/manutencao");
  void import("./components/abastecimento/DashboardAbastecimento");
  void import("./components/abastecimento/LancarAbastecimento");
  void import("./modules/abastecimento/MyAbastecimentos");
  void import("./pages/Dashboard");
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050712]">
      <div className="relative flex flex-col items-center gap-4">
        <div className="h-24 w-24 rounded-full bg-gradient-to-tr from-sky-500/40 via-emerald-400/30 to-sky-500/40 blur-2xl" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex gap-2">
            <span className="h-2 w-2 animate-bounce rounded-full bg-sky-400 [animation-delay:-0.2s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.05s]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-sky-400 [animation-delay:0.1s]" />
          </div>
        </div>
        <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-400">
          Carregando painel
        </p>
      </div>
    </div>
  );
}

function ChecklistRoute() {
  const { tipoChecklist } = useParams<{ tipoChecklist: string }>();
  const { appUser } = useAuth();
  if (
    !tipoChecklist ||
    !["veiculo", "equipamento", "gerador"].includes(tipoChecklist)
  ) {
    return <Navigate to="/" replace />;
  }
  const user = appUser
    ? {
        nome: appUser.nome,
        role: appUser.role,
        roles: appUser.roles ?? [],
        uid: appUser.uid,
      }
    : null;
  return <Checklist user={user} tipoChecklist={tipoChecklist} />;
}

function AuthenticatedRoutes() {
  const { user, appUser, initializing } = useAuth();

  if (initializing) return <Splash />;
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    );
  }

  const roles = appUser?.roles ?? (appUser?.role ? [appUser.role] : []);
  const isAdmin = roles.includes("admin");
  const isMotorista = roles.includes("motorista");
  const isVendedor = roles.includes("vendedor");
  const canAbastecerPublic = isAdmin || isMotorista || isVendedor;
  const nome = appUser?.nome ?? "Usuário";

  useEffect(() => {
    preloadProtectedChunks();
  }, []);

  return (
    <Routes>
      <Route element={<ProtectedLayout />}>
        <Route
          index
          element={isAdmin ? <Navigate to="/dashboard" replace /> : <Home />}
        />
        <Route
          path="dashboard"
          element={isAdmin ? <Dashboard /> : <Navigate to="/" replace />}
        />
        <Route path="checklist/:tipoChecklist" element={<ChecklistRoute />} />
        <Route path="historico" element={<Historico motorista={nome} />} />
        <Route
          path="manutencao"
          element={
            isAdmin ? (
              <Manutencao usuario={nome} role={appUser?.role ?? "admin"} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="admin"
          element={
            isAdmin ? (
              <AdminPanel motorista={nome} role={appUser?.role ?? "admin"} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="abastecimento"
          element={
            isAdmin ? (
              <AbastecimentoDashboard />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="abastecimento/novo/:vehicleId?"
          element={
            isAdmin ? (
              <LancarAbastecimento defaultFrota="leve" />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="meus-abastecimentos"
          element={<MyAbastecimentos motorista={nome} />}
        />
        <Route
          path="abastecimento/lancar"
          element={
            (() => {
              if (!canAbastecerPublic) return <Navigate to="/" replace />;
              const allowedFrotas = [
                ...(isAdmin ? ["leve", "pesada"] : []),
                ...(!isAdmin && isMotorista ? ["pesada"] : []),
                ...(!isAdmin && isVendedor ? ["leve"] : []),
              ].filter((v, i, a) => a.indexOf(v) === i) as ("leve" | "pesada")[];
              const defaultFrota = isAdmin
                ? "leve"
                : isMotorista && !isVendedor
                  ? "pesada"
                  : isVendedor && !isMotorista
                    ? "leve"
                    : "";
              return (
                <div className="container py-3">
                  <LancarAbastecimento
                    publicMode
                    allowedFrotas={allowedFrotas}
                    defaultFrota={defaultFrota}
                    lockFrota={allowedFrotas.length === 1}
                    hideSearch
                  />
                </div>
              );
            })()
          }
        />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export function App() {
  return (
    <div className="min-h-screen bg-[#0b0d12]">
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<Splash />}>
            <AuthenticatedRoutes />
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
