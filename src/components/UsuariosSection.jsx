import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
} from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { db, auth } from "../services/firebase";

export default function UsuariosSection({ onReload, usuariosExternos }) {
  // Lista (vinda de fora ou carregada aqui)
  const [usuarios, setUsuarios] = useState(Array.isArray(usuariosExternos) ? usuariosExternos : []);
  const [loading, setLoading] = useState(!Array.isArray(usuariosExternos));

  // Editar
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null); // {id, nome, email, role}
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [okMsg, setOkMsg] = useState("");

  // Cadastrar (novo)
  const [cadOpen, setCadOpen] = useState(false);
  const [cadNome, setCadNome] = useState("");
  const [cadEmail, setCadEmail] = useState("");
  const [cadSenha, setCadSenha] = useState("");
  const [cadRole, setCadRole] = useState("motorista");
  const [cadErro, setCadErro] = useState("");
  const [cadOk, setCadOk] = useState("");
  const [cadSaving, setCadSaving] = useState(false);

  async function loadUsuarios() {
    if (Array.isArray(usuariosExternos)) return; // quem controla é o AdminPanel
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "usuarios"), orderBy("nome", "asc")));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsuarios(list);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (Array.isArray(usuariosExternos)) {
      setUsuarios(usuariosExternos);
    } else {
      loadUsuarios();
    }
  }, [usuariosExternos]);

  /* ======== Editar ======== */
  const openEdit = (u) => {
    setErro("");
    setOkMsg("");
    setEditing({ id: u.id, nome: u.nome || "", email: u.email || "", role: u.role || "motorista" });
    setEditOpen(true);
  };
  const closeEdit = () => {
    setEditOpen(false);
    setEditing(null);
    setSaving(false);
    setErro("");
    setOkMsg("");
  };
  const handleSave = async (e) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setErro("");
    setOkMsg("");

    try {
      const ref = doc(db, "usuarios", editing.id);
      // NÃO altera o e-mail no Auth — apenas no Firestore (como combinado).
      await updateDoc(ref, {
        nome: (editing.nome || "").trim(),
        email: (editing.email || "").trim(),
        role: editing.role || "motorista",
      });

      setOkMsg("Usuário atualizado com sucesso!");
      // Atualiza lista local instantaneamente
      setUsuarios((prev) => prev.map(u => u.id === editing.id ? { ...u, ...editing } : u));

      if (typeof onReload === "function") {
        try { await onReload(); } catch {}
      }

      setTimeout(closeEdit, 900);
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar. Tente novamente.");
      setSaving(false);
    }
  };

  /* ======== Excluir ======== */
  const handleDelete = async (u) => {
    if (!u?.id) return;
    if (!window.confirm(`Excluir o usuário "${u.nome || u.email}"? Isso remove o doc no Firestore (não o Auth).`)) return;
    try {
      await deleteDoc(doc(db, "usuarios", u.id));
      setUsuarios((prev) => prev.filter(x => x.id !== u.id));

      if (typeof onReload === "function") {
        try { await onReload(); } catch {}
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao excluir usuário.");
    }
  };

  /* ======== Criar (Cadastro embutido) ======== */
  const openCreate = () => {
    setCadErro("");
    setCadOk("");
    setCadNome("");
    setCadEmail("");
    setCadSenha("");
    setCadRole("motorista");
    setCadOpen(true);
  };
  const closeCreate = () => {
    setCadOpen(false);
    setCadErro("");
    setCadOk("");
    setCadSaving(false);
  };
  const handleCreate = async (e) => {
    e.preventDefault();
    setCadErro("");
    setCadOk("");
    setCadSaving(true);

    try {
      const cred = await createUserWithEmailAndPassword(auth, cadEmail, cadSenha);
      await setDoc(doc(db, "usuarios", cred.user.uid), {
        nome: (cadNome || "").trim(),
        email: (cadEmail || "").trim(),
        role: cadRole || "motorista",
      });

      setCadOk("Usuário cadastrado com sucesso!");

      // Atualiza lista local
      setUsuarios(prev => {
        const novo = { id: cred.user.uid, nome: cadNome, email: cadEmail, role: cadRole };
        // insere mantendo ordenação por nome (simples)
        return [...prev, novo].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
      });

      if (typeof onReload === "function") {
        try { await onReload(); } catch {}
      }

      setTimeout(closeCreate, 900);
    } catch (error) {
      console.error(error);
      if (error.code === "auth/email-already-in-use") setCadErro("E-mail já cadastrado.");
      else if (error.code === "auth/weak-password") setCadErro("Senha muito fraca. Use pelo menos 6 caracteres.");
      else setCadErro("Erro ao criar conta. Verifique os campos e tente novamente.");
      setCadSaving(false);
    }
  };

  const roleLabel = (role) => {
    if (role === "motorista") return "Motorista";
    if (role === "operador_empilhadeira") return "Operador de Empilhadeira";
    if (role === "operador_gerador") return "Operador de Gerador";
    if (role === "vendedor") return "Vendedor";
    if (role === "admin") return "Admin";
    return role || "-";
  };

  return (
    <div className="mb-5 rounded-2xl border border-white/10 bg-[#161a24] shadow-lg ring-1 ring-white/5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4">
        <h5 className="flex items-center text-lg font-bold text-sky-400">
          Usuários cadastrados
          <span className="ml-2 rounded-lg bg-sky-500/20 px-2 py-0.5 text-sm font-bold text-sky-300">{usuarios.length}</span>
        </h5>
        <button
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          onClick={openCreate}
          type="button"
        >
          + Cadastrar novo usuário
        </button>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="text-slate-400">Carregando...</div>
        ) : usuarios.length === 0 ? (
          <div className="text-slate-400">Nenhum usuário cadastrado.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20">
            <table className="min-w-full text-sm align-middle">
              <thead className="bg-black/20 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Função</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {usuarios.map(u => (
                  <tr key={u.id} className="hover:bg-white/5">
                    <td className="px-3 py-2 font-semibold text-slate-200">{u.nome || "-"}</td>
                    <td className="px-3 py-2 text-slate-300">{u.email || "-"}</td>
                    <td className="px-3 py-2 text-slate-300">
                      {roleLabel(u.role)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="mr-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-400 hover:bg-sky-500/20"
                        onClick={() => openEdit(u)}
                      >
                        Editar
                      </button>
                      <button
                        className="rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20"
                        onClick={() => handleDelete(u)}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editOpen && editing && (
        <div
          className="fixed inset-0 z-[1090] flex items-center justify-center bg-black/60 p-4"
          aria-modal="true"
          role="dialog"
          onClick={closeEdit}
        >
          <div
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-2xl border border-white/10 bg-[#161a24] p-1 shadow-xl">
              <form onSubmit={handleSave}>
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <h5 className="font-bold text-sky-400">Editar Usuário</h5>
                  <button type="button" className="rounded-lg p-1 text-slate-400 hover:bg-white/10" onClick={closeEdit}>×</button>
                </div>
                <div className="px-4 py-4">
                  {erro && <div className="mb-3 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-400">{erro}</div>}
                  {okMsg && <div className="mb-3 rounded-lg bg-emerald-500/20 px-3 py-2 text-sm text-emerald-400">{okMsg}</div>}

                  <div className="grid gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Nome</label>
                      <input
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={editing.nome}
                        onChange={(e) => setEditing(prev => ({ ...prev, nome: e.target.value }))}
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">E-mail</label>
                      <input
                        type="email"
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={editing.email}
                        onChange={(e) => setEditing(prev => ({ ...prev, email: e.target.value }))}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Função</label>
                      <select
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={editing.role}
                        onChange={(e) => setEditing(prev => ({ ...prev, role: e.target.value }))}
                        required
                      >
                        <option value="motorista">Motorista</option>
                        <option value="operador_empilhadeira">Operador de Empilhadeira</option>
                        <option value="operador_gerador">Operador de Gerador</option>
                        <option value="vendedor">Vendedor</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
                  <button type="button" className="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-white/10" onClick={closeEdit}>
                    Cancelar
                  </button>
                  <button type="submit" className="rounded-xl bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50" disabled={saving}>
                    {saving ? "Salvando..." : "Salvar alterações"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {cadOpen && (
        <div
          className="fixed inset-0 z-[1090] flex items-center justify-center bg-black/60 p-4"
          aria-modal="true"
          role="dialog"
          onClick={closeCreate}
        >
          <div
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-2xl border border-white/10 bg-[#161a24] p-1 shadow-xl">
              <form onSubmit={handleCreate}>
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <h5 className="font-bold text-sky-400">Cadastrar Usuário</h5>
                  <button type="button" className="rounded-lg p-1 text-slate-400 hover:bg-white/10" onClick={closeCreate}>×</button>
                </div>
                <div className="px-4 py-4">
                  {cadErro && <div className="mb-3 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-400">{cadErro}</div>}
                  {cadOk && <div className="mb-3 rounded-lg bg-emerald-500/20 px-3 py-2 text-sm text-emerald-400">{cadOk}</div>}

                  <div className="grid gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Nome</label>
                      <input
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={cadNome}
                        onChange={(e) => setCadNome(e.target.value)}
                        required
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">E-mail</label>
                      <input
                        type="email"
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={cadEmail}
                        onChange={(e) => setCadEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Senha</label>
                      <input
                        type="password"
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={cadSenha}
                        onChange={(e) => setCadSenha(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">Função</label>
                      <select
                        className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        value={cadRole}
                        onChange={(e) => setCadRole(e.target.value)}
                        required
                      >
                        <option value="motorista">Motorista</option>
                        <option value="operador_empilhadeira">Operador de Empilhadeira</option>
                        <option value="operador_gerador">Operador de Gerador</option>
                        <option value="vendedor">Vendedor</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
                  <button type="button" className="rounded-xl border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-white/10" onClick={closeCreate}>
                    Cancelar
                  </button>
                  <button type="submit" className="rounded-xl bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50" disabled={cadSaving}>
                    {cadSaving ? "Salvando..." : "Registrar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
