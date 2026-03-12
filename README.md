# Checklist Logma v2.0

Aplicacao interna para checklists operacionais, manutencao e abastecimento de frota da Logma.
A versao 2.0 consolida o frontend em Tailwind, TypeScript progressivo e dashboards modernos com Recharts.

## Stack v2.0

- React + Vite
- Tailwind CSS v4
- TypeScript (modo strict, migracao progressiva)
- Firebase (Auth, Firestore, Storage, App Check)
- Recharts (dashboards e graficos)
- React Router
- React Icons
- xlsx + jsPDF para exportacao

## O que mudou na v2.0

- Remocao de Bootstrap da UI principal
- Novo layout protegido com `Sidebar` fixa e navegacao por role
- Refatoracao de autenticacao com `AuthContext` tipado
- Dashboard de abastecimento com KPIs e graficos Recharts
- AdminPanel migrado para visual dark premium + Recharts
- Historico e Home migrados para Tailwind
- Manutencao, Veiculos e Usuarios migrados para padrao visual Tailwind
- Camada de servicos tipada em TypeScript:
  - `services/firebase.ts`
  - `services/abastecimentos.ts`
  - `services/veiculos.ts`
- Tipos centralizados em `src/types/index.ts`

## Estrutura principal

```txt
src/
  auth/
    AuthContext.tsx
    ProtectedRoute.tsx
  layouts/
    ProtectedLayout.tsx
    Sidebar.tsx
  services/
    firebase.ts
    abastecimentos.ts
    veiculos.ts
  types/
    index.ts
  pages/
    Home.tsx
    Historico.tsx
    AdminPanel.jsx
    manutencao.jsx
    Checklist.jsx
  components/
    Login.tsx
    VeiculosSection.jsx
    UsuariosSection.jsx
    abastecimento/
      DashboardAbastecimento.jsx
      ModalLancarAbastecimento.jsx
      EditarAbastecimentoModal.jsx
```

## Permissoes e perfis

- `admin`
- `motorista`
- `operador_empilhadeira`
- `operador_gerador`
- `vendedor`

As rotas e opcoes de menu sao controladas por role no layout protegido.

## Ambiente de desenvolvimento

### Pre-requisitos

- Node.js 18+
- npm
- Projeto Firebase configurado (Auth + Firestore + Storage)
- Arquivo `.env` local com chaves do Firebase

### Instalar dependencias

```bash
npm install
```

### Rodar em desenvolvimento

```bash
npm run dev
```

### Build de producao

```bash
npm run build
```

## Seguranca e politicas internas

- Nunca commitar `.env`
- Manter `.gitignore` cobrindo arquivos sensiveis e temporarios
- Uso interno e confidencial
- Dados operacionais devem seguir politicas internas da Logma

## Licenciamento interno

Este software e de uso interno e confidencial da Logma.
Nao e permitido copiar, distribuir, sublicenciar, revender, publicar ou disponibilizar este software a terceiros sem autorizacao expressa por escrito.

Copyright (c) Logma Transportes.
