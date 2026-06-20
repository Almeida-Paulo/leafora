export const projects = [
  {
    id: "nascente-mg",
    name: "Guardioes da Nascente",
    category: "Agua e reflorestamento",
    biome: "Mata Atlantica",
    location: "Serra da Mantiqueira, MG",
    image: "/assets/img/project-spring.png",
    status: "Field evidence",
    goalSui: 12500,
    raisedSui: 4890,
    supporters: 146,
    impact: "12 hectares de mata ciliar e 18 mil mudas nativas",
    objective: "Restaurar uma nascente degradada e proteger sua mata ciliar com plantio, cercamento e monitoramento publico.",
    story: "O projeto combina restauracao de mata ciliar, protecao de nascente e acompanhamento visual recorrente. Cada milestone deve produzir evidencia registrada no Leafora Registry.",
    risks: "Execucao depende de clima, acesso ao terreno, manutencao das mudas e participacao local.",
    chain: { projectId: "", vaultId: "" },
    milestones: [
      ["Diagnostico e cercamento", 2500, "completed"],
      ["Compra de mudas nativas", 3800, "active"],
      ["Plantio e irrigacao inicial", 4200, "planned"],
      ["Monitoramento semestral", 2000, "planned"]
    ],
    evidence: [
      ["EV-MG-001", "Coordenada inicial da nascente", "Approved", "0x9c4f1d8b7a6e493acb1c0fd7468a4f8a29f49d7dcb0e9a7a4479c9b2d175a103", "6gyf4v", "2026-06-10T13:42:00Z", "Leafora Capture"]
    ],
    tiers: [
      ["seed", "Seed", 5, 30, 0, "ipfs://leafora/nascente/seed.json", "Badge inicial e registro de apoio."],
      ["guardian", "Guardian", 25, 170, 1, "ipfs://leafora/nascente/guardian.json", "NFT do projeto e destaque no mural."],
      ["founder", "Founder", 100, 840, 2, "ipfs://leafora/nascente/founder.json", "Badge fundador e maior peso de participacao."]
    ]
  },
  {
    id: "cerrado-go",
    name: "Agrofloresta do Cerrado",
    category: "Agrofloresta",
    biome: "Cerrado",
    location: "Chapada dos Veadeiros, GO",
    image: "/assets/img/project-cerrado.png",
    status: "Documented",
    goalSui: 17200,
    raisedSui: 6780,
    supporters: 201,
    impact: "8 hectares recuperados com sistemas agroflorestais",
    objective: "Converter solo degradado em agrofloresta produtiva com especies nativas, alimentos e renda local.",
    story: "A agrofloresta cria uma ponte entre restauracao ecologica e economia local. A Leafora registra evidencias de plantio, manutencao e produtividade ao longo do tempo.",
    risks: "Riscos incluem seca, perdas no plantio, custo de insumos e necessidade de manejo continuo.",
    chain: { projectId: "", vaultId: "" },
    milestones: [
      ["Analise do solo", 1900, "completed"],
      ["Implantacao de linhas", 5800, "active"],
      ["Irrigacao e manejo", 5000, "planned"],
      ["Monitoramento produtivo", 4500, "planned"]
    ],
    evidence: [
      ["EV-GO-001", "Amostra de solo e talhao inicial", "Approved", "0x68f682afc1f0e3fd7a9538d9200dddb7b14cd7acafe9150a0df264c1aa439bef", "6vdx2n", "2026-06-08T15:08:00Z", "Leafora Capture"]
    ],
    tiers: [
      ["seed", "Seed", 5, 26, 0, "ipfs://leafora/cerrado/seed.json", "Badge inicial da agrofloresta."],
      ["steward", "Steward", 30, 210, 1, "ipfs://leafora/cerrado/steward.json", "NFT de guardiao do Cerrado."],
      ["legacy", "Legacy", 140, 1180, 2, "ipfs://leafora/cerrado/legacy.json", "Badge legado e prioridade em updates."]
    ]
  },
  {
    id: "mangue-ba",
    name: "Manguezal Vivo",
    category: "Carbono azul",
    biome: "Manguezal",
    location: "Baia de Todos-os-Santos, BA",
    image: "/assets/img/project-mangrove.png",
    status: "Validated",
    goalSui: 21600,
    raisedSui: 14210,
    supporters: 318,
    impact: "5 km de margem monitorada e restauracao de bercario natural",
    objective: "Restaurar area de mangue, proteger biodiversidade costeira e criar monitoramento publico de carbono azul.",
    story: "Manguezais sao infraestrutura viva. O projeto une restauracao, monitoramento de campo e registro publico para acompanhar recuperacao costeira.",
    risks: "A execucao depende de mare, pressao urbana, autorizacoes locais e manutencao de mudas.",
    chain: { projectId: "", vaultId: "" },
    milestones: [
      ["Mapeamento da area", 2800, "completed"],
      ["Viveiro de mudas", 5000, "completed"],
      ["Restauracao de margem", 8600, "active"],
      ["Carbono azul", 5200, "planned"]
    ],
    evidence: [
      ["EV-BA-001", "Linha base do manguezal", "Approved", "0x3f67d87b5d4616e5d678c707eebd6edb6c7bdfcc8a939bfda716a38a35dc87cb", "7jsj89", "2026-06-03T12:55:00Z", "Leafora Capture"]
    ],
    tiers: [
      ["seed", "Seed", 7, 45, 0, "ipfs://leafora/mangue/seed.json", "Badge inicial de carbono azul."],
      ["guardian", "Guardian", 35, 260, 1, "ipfs://leafora/mangue/guardian.json", "NFT de guardiao do mangue."],
      ["founder", "Founder", 180, 1620, 2, "ipfs://leafora/mangue/founder.json", "Badge fundador e registro de maior peso."]
    ]
  }
];
