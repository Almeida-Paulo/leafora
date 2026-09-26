import { t } from "./i18n.js";

export const projects = [
  {
    id: "nascente-mg",
    name: t("Guardioes da Nascente"),
    category: t("Agua e reflorestamento"),
    biome: t("Mata Atlantica"),
    location: "Serra da Mantiqueira, MG",
    image: "/assets/img/project-spring.png",
    status: "Field evidence",
    goalSui: 12500,
    raisedSui: 4890,
    fundingUsd: { goal: 12500, raised: 4890, milestones: [2500, 3800, 4200, 2000] },
    supporters: 146,
    impact: t("12 hectares de mata ciliar e 18 mil mudas nativas"),
    objective: t("Restaurar uma nascente degradada e proteger sua mata ciliar com plantio, cercamento e monitoramento publico."),
    story: t("O projeto combina restauracao de mata ciliar, protecao de nascente e acompanhamento visual recorrente. Cada milestone deve produzir evidencia registrada no Leafora Registry."),
    risks: t("Execucao depende de clima, acesso ao terreno, manutencao das mudas e participacao local."),
    chain: { projectId: "", vaultId: "" },
    milestones: [
      [t("Diagnostico e cercamento"), 2500, "completed"],
      [t("Compra de mudas nativas"), 3800, "active"],
      [t("Plantio e irrigacao inicial"), 4200, "planned"],
      [t("Monitoramento semestral"), 2000, "planned"]
    ],
    evidence: [
      ["EV-MG-001", t("Coordenada inicial da nascente"), "Approved", "0x9c4f1d8b7a6e493acb1c0fd7468a4f8a29f49d7dcb0e9a7a4479c9b2d175a103", "6gyf4v", "2026-06-10T13:42:00Z", "Leafora Capture"]
    ],
    tiers: [
      ["seed", t("Seed"), 5, 30, 0, "ipfs://leafora/nascente/seed.json", t("Badge inicial e registro de apoio.")],
      ["guardian", t("Guardian"), 25, 170, 1, "ipfs://leafora/nascente/guardian.json", t("NFT do projeto e destaque no mural.")],
      ["founder", t("Founder"), 100, 840, 2, "ipfs://leafora/nascente/founder.json", t("Badge fundador e maior peso de participacao.")]
    ]
  },
  {
    id: "cerrado-go",
    name: t("Agrofloresta do Cerrado"),
    category: t("Agrofloresta"),
    biome: "Cerrado",
    location: "Chapada dos Veadeiros, GO",
    image: "/assets/img/project-cerrado.png",
    status: "Documented",
    goalSui: 17200,
    raisedSui: 6780,
    fundingUsd: { goal: 17200, raised: 6780, milestones: [1900, 5800, 5000, 4500] },
    supporters: 201,
    impact: t("8 hectares recuperados com sistemas agroflorestais"),
    objective: t("Converter solo degradado em agrofloresta produtiva com especies nativas, alimentos e renda local."),
    story: t("A agrofloresta cria uma ponte entre restauracao ecologica e economia local. A Leafora registra evidencias de plantio, manutencao e produtividade ao longo do tempo."),
    risks: t("Riscos incluem seca, perdas no plantio, custo de insumos e necessidade de manejo continuo."),
    chain: { projectId: "", vaultId: "" },
    milestones: [
      [t("Analise do solo"), 1900, "completed"],
      [t("Implantacao de linhas"), 5800, "active"],
      [t("Irrigacao e manejo"), 5000, "planned"],
      [t("Monitoramento produtivo"), 4500, "planned"]
    ],
    evidence: [
      ["EV-GO-001", t("Amostra de solo e talhao inicial"), "Approved", "0x68f682afc1f0e3fd7a9538d9200dddb7b14cd7acafe9150a0df264c1aa439bef", "6vdx2n", "2026-06-08T15:08:00Z", "Leafora Capture"]
    ],
    tiers: [
      ["seed", t("Seed"), 5, 26, 0, "ipfs://leafora/cerrado/seed.json", t("Badge inicial da agrofloresta.")],
      ["steward", t("Steward"), 30, 210, 1, "ipfs://leafora/cerrado/steward.json", t("NFT de guardiao do Cerrado.")],
      ["legacy", t("Legacy"), 140, 1180, 2, "ipfs://leafora/cerrado/legacy.json", t("Badge legado e prioridade em updates.")]
    ]
  },
  {
    id: "mangue-ba",
    name: t("Manguezal Vivo"),
    category: t("Carbono azul"),
    biome: t("Manguezal"),
    location: t("Baia de Todos-os-Santos, BA"),
    image: "/assets/img/project-mangrove.png",
    status: "Validated",
    goalSui: 21600,
    raisedSui: 14210,
    fundingUsd: { goal: 21600, raised: 14210, milestones: [2800, 5000, 8600, 5200] },
    supporters: 318,
    impact: t("5 km de margem monitorada e restauracao de bercario natural"),
    objective: t("Restaurar area de mangue, proteger biodiversidade costeira e criar monitoramento publico de carbono azul."),
    story: t("Manguezais sao infraestrutura viva. O projeto une restauracao, monitoramento de campo e registro publico para acompanhar recuperacao costeira."),
    risks: t("A execucao depende de mare, pressao urbana, autorizacoes locais e manutencao de mudas."),
    chain: { projectId: "", vaultId: "" },
    milestones: [
      [t("Mapeamento da area"), 2800, "completed"],
      [t("Viveiro de mudas"), 5000, "completed"],
      [t("Restauracao de margem"), 8600, "active"],
      [t("Carbono azul"), 5200, "planned"]
    ],
    evidence: [
      ["EV-BA-001", t("Linha base do manguezal"), "Approved", "0x3f67d87b5d4616e5d678c707eebd6edb6c7bdfcc8a939bfda716a38a35dc87cb", "7jsj89", "2026-06-03T12:55:00Z", "Leafora Capture"]
    ],
    tiers: [
      ["seed", t("Seed"), 7, 45, 0, "ipfs://leafora/mangue/seed.json", t("Badge inicial de carbono azul.")],
      ["guardian", t("Guardian"), 35, 260, 1, "ipfs://leafora/mangue/guardian.json", t("NFT de guardiao do mangue.")],
      ["founder", t("Founder"), 180, 1620, 2, "ipfs://leafora/mangue/founder.json", t("Badge fundador e registro de maior peso.")]
    ]
  }
];
