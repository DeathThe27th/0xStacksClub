// Curated launch baskets and the categories the Baskets tab groups by. A basket is still an
// onchain Stack: these are only the recipes we launch, plus display grouping. Any basket whose
// ticker isn't listed here shows under "Community".

export type BasketCategory = { id: string; label: string; blurb: string; newsKeywords: RegExp; newsCategory: "general" | "crypto" };

export const BASKET_CATEGORIES: BasketCategory[] = [
  {
    id: "semis",
    label: "Semiconductors",
    blurb: "The chips, memory and fabs behind every AI model",
    newsKeywords: /chip|semiconductor|foundry|memory|dram|nand|hbm|wafer|nvidia|tsmc|micron|hynix|broadcom|\bamd\b|\barm\b/i,
    newsCategory: "general",
  },
  {
    id: "ai-infra",
    label: "AI infrastructure",
    blurb: "Clouds, data centres and the optics that connect them",
    newsKeywords: /data cent|cloud|\bai\b|artificial intelligence|gpu|optical|fiber|networking|coreweave|oracle|nebius|hyperscal/i,
    newsCategory: "general",
  },
  {
    id: "big-tech",
    label: "Big tech",
    blurb: "The largest platforms on the market",
    newsKeywords: /microsoft|alphabet|google|meta|tesla|nvidia|big tech|megacap|nasdaq/i,
    newsCategory: "general",
  },
  {
    id: "crypto",
    label: "Crypto & fintech",
    blurb: "Companies whose business moves with crypto",
    newsKeywords: /./,
    newsCategory: "crypto",
  },
  {
    id: "frontier",
    label: "Frontier tech",
    blurb: "Space, quantum and wafer-scale compute",
    newsKeywords: /space|rocket|launch|satellite|quantum|spacex|rocket lab|cerebras|qubit/i,
    newsCategory: "general",
  },
];

export const COMMUNITY_CATEGORY = { id: "community", label: "Community", blurb: "Baskets made by people on the app" } as const;

export type CuratedBasket = {
  ticker: string;
  name: string;
  category: string;
  description: string;
  /** Two gradient stops for the basket's badge and generated cover image. */
  colors: [string, string];
  /** Glyph drawn on the basket's badge (see BASKET_ICONS in components/ui/TokenLogo). */
  icon: "cpu" | "memory" | "earth" | "cloud" | "zap" | "crown" | "blocks" | "rocket";
  /** bStocks addresses (checksummed). The vault allowlist is the final check onchain. */
  components: { ticker: string; address: `0x${string}`; weightBps: number }[];
};

export const CURATED_BASKETS: CuratedBasket[] = [
  {
    ticker: "CHIPS",
    name: "Semiconductor Core",
    category: "semis",
    description:
      "The five companies that design and make most of the world's AI chips. NVIDIA and AMD design the GPUs, Broadcom the custom accelerators, Arm the CPU cores, and TSMC fabricates nearly all of them.",
    colors: ["#6C47FF", "#1E1B4B"],
    icon: "cpu",
    components: [
      { ticker: "NVDA", address: "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436", weightBps: 3000 },
      { ticker: "TSM", address: "0xAB78b89B5bb00236Be0B4B20704cBfa04EfC711c", weightBps: 2500 },
      { ticker: "AVGO", address: "0x76682c454467b3A1150Ad8b6a92FC5eE2C21d7eD", weightBps: 2000 },
      { ticker: "AMD", address: "0x75Fd4cF6f8392E41E70391D60c90C0D5211603a1", weightBps: 1500 },
      { ticker: "ARM", address: "0xD42A79ebb7F527F40fAecD196FFB47aD5e8D6f8C", weightBps: 1000 },
    ],
  },
  {
    ticker: "MEMRY",
    name: "Memory & Storage",
    category: "semis",
    description:
      "AI models are hungry for memory. Micron and SK Hynix make the DRAM and HBM stacked next to every GPU, SanDisk and Western Digital the flash and drives that hold the data. These four tend to move together through the memory cycle.",
    colors: ["#0EA5E9", "#0B1E3F"],
    icon: "memory",
    components: [
      { ticker: "MU", address: "0xcdf2f3e0fa43C47A6662a91C9E4a7C5f69762699", weightBps: 3000 },
      { ticker: "SKHY", address: "0xCA750eF65f295BBECd685Abf54e82CAf297BDB61", weightBps: 3000 },
      { ticker: "SNDK", address: "0x3eE4dF61bd4F867E349BEaE8bFE07bc31b4850fb", weightBps: 2000 },
      { ticker: "WDC", address: "0xebe29695F8047C13d36e7a790ca8c1b239FfAD1C", weightBps: 2000 },
    ],
  },
  {
    ticker: "ASIA",
    name: "Asian Silicon",
    category: "semis",
    description:
      "Asia's side of the tech supply chain: TSMC in Taiwan, SK Hynix and the wider Korean market, and Alibaba's cloud and chip design in China.",
    colors: ["#F43F5E", "#3B0A1A"],
    icon: "earth",
    components: [
      { ticker: "TSM", address: "0xAB78b89B5bb00236Be0B4B20704cBfa04EfC711c", weightBps: 3000 },
      { ticker: "SKHY", address: "0xCA750eF65f295BBECd685Abf54e82CAf297BDB61", weightBps: 3000 },
      { ticker: "BABA", address: "0x4eF9d3062c7F6ebA4AAE4990c5036598C6eff4ec", weightBps: 2000 },
      { ticker: "EWY", address: "0xBE82F76637DBA2C114C41Df856c2C51e522E2Cb8", weightBps: 2000 },
    ],
  },
  {
    ticker: "CLOUD",
    name: "AI Cloud",
    category: "ai-infra",
    description:
      "Where AI actually runs. The newer GPU clouds CoreWeave and Nebius next to the incumbents Oracle, Microsoft Azure and Google Cloud, all spending heavily on data centres.",
    colors: ["#22C55E", "#052E16"],
    icon: "cloud",
    components: [
      { ticker: "CRWV", address: "0x33E7317e17838fEE56b10Fe8D0B9cA6CA3090c95", weightBps: 2000 },
      { ticker: "NBIS", address: "0xE256BC2A4F5297F8ba6f043F180a46300eCbCbB1", weightBps: 2000 },
      { ticker: "ORCL", address: "0x4684D9887fC1c71cBa7baB8E88835CEC217eB598", weightBps: 2000 },
      { ticker: "MSFT", address: "0x80106cb3EAD06659A5ad19DF39D9b4733863B9b0", weightBps: 2000 },
      { ticker: "GOOGL", address: "0x3F53De71c126BdaBAe20f9cD64848d317f6C3238", weightBps: 2000 },
    ],
  },
  {
    ticker: "OPTIC",
    name: "Light Speed",
    category: "ai-infra",
    description:
      "Data centres are moving from copper to light. Lumentum and Applied Optoelectronics make the lasers and transceivers, Marvell the optical chips, Corning the fibre, and AXT the indium phosphide wafers they are built on.",
    colors: ["#F59E0B", "#3A2204"],
    icon: "zap",
    components: [
      { ticker: "LITE", address: "0x64748BeA17b6D19e242ADf20425DE2440c656142", weightBps: 2500 },
      { ticker: "MRVL", address: "0x16cd4fe7e8880ECc3ba222795229E20489fc2C76", weightBps: 2500 },
      { ticker: "GLW", address: "0x740e075cBbEa22a082B9d6679e65e82767875b6A", weightBps: 2000 },
      { ticker: "AAOI", address: "0x10343EF7da3301493D7Ecb647d68A288C6c1Db2F", weightBps: 1500 },
      { ticker: "AXTI", address: "0x9BDC8B470dbf89DbCb123587C6f5E49cCA3463BE", weightBps: 1500 },
    ],
  },
  {
    ticker: "MEGA",
    name: "Megacaps",
    category: "big-tech",
    description: "Five of the largest companies on the market in equal parts: NVIDIA, Microsoft, Alphabet, Meta and Tesla.",
    colors: ["#A855F7", "#2E1065"],
    icon: "crown",
    components: [
      { ticker: "NVDA", address: "0x02Fca66C1D1aFB4E2A7884261eB00F63598a7436", weightBps: 2000 },
      { ticker: "MSFT", address: "0x80106cb3EAD06659A5ad19DF39D9b4733863B9b0", weightBps: 2000 },
      { ticker: "GOOGL", address: "0x3F53De71c126BdaBAe20f9cD64848d317f6C3238", weightBps: 2000 },
      { ticker: "META", address: "0x7425889FE94F9d693E8daefE88BCCed6AcFEf4c0", weightBps: 2000 },
      { ticker: "TSLA", address: "0x5b1910eAaD6450E50f816082Aa078C41F10C292f", weightBps: 2000 },
    ],
  },
  {
    ticker: "RAILS",
    name: "Crypto Rails",
    category: "crypto",
    description:
      "The listed companies closest to crypto: Coinbase the exchange, Circle the USDC issuer, Robinhood the retail broker, and Strategy the largest corporate bitcoin holder. They tend to follow bitcoin.",
    colors: ["#3B82F6", "#0A1A3F"],
    icon: "blocks",
    components: [
      { ticker: "COIN", address: "0x585BDE7C54ABB5cCD7791F923D6c2187635f3952", weightBps: 3000 },
      { ticker: "CRCL", address: "0x80f3D493EBCe97e343c53D29a137942416B4ffC0", weightBps: 2500 },
      { ticker: "HOOD", address: "0xA394dCEa3fd3847fD793afBFd163E2e3858B7c65", weightBps: 2500 },
      { ticker: "MSTR", address: "0xE87afb3076AeB0f9B14E368DE8145ae6a2826A14", weightBps: 2000 },
    ],
  },
  {
    ticker: "MOON",
    name: "Moonshots",
    category: "frontier",
    description:
      "Long-horizon bets on what comes after today's tech: SpaceX and Rocket Lab in launch, Quantinuum and IBM in quantum computing, Cerebras in wafer-scale AI chips. Expect big swings.",
    colors: ["#EC4899", "#1F0A2E"],
    icon: "rocket",
    components: [
      { ticker: "SPCX", address: "0xbe9D156892E55e7154BcD3cB0FEA677F9D3103E1", weightBps: 2500 },
      { ticker: "RKLB", address: "0xC8Da12cbCCE7c45180692a6420b0076e03a5179a", weightBps: 2500 },
      { ticker: "QNT", address: "0xd721c192d612Db77621DF57A9fAb38418033c02E", weightBps: 2000 },
      { ticker: "IBM", address: "0xfA273B076Feb8c0FB34e554ae341082323D016A3", weightBps: 1500 },
      { ticker: "CBRS", address: "0xe81C6bB0266cd68B4F17278531Dd03eA1F12dA4E", weightBps: 1500 },
    ],
  },
];

const byTicker = new Map(CURATED_BASKETS.map((b) => [b.ticker, b]));

/** Category for a basket ticker; anything not curated is Community. */
export function basketCategory(ticker: string | null | undefined): { id: string; label: string; blurb: string } {
  const curated = ticker ? byTicker.get(ticker.toUpperCase()) : undefined;
  return BASKET_CATEGORIES.find((c) => c.id === curated?.category) ?? COMMUNITY_CATEGORY;
}

export function curatedBasket(ticker: string | null | undefined): CuratedBasket | undefined {
  return ticker ? byTicker.get(ticker.replace(/^\$/, "").toUpperCase()) : undefined;
}

export function isCurated(ticker: string | null | undefined) {
  return !!ticker && byTicker.has(ticker.toUpperCase());
}

/** Wallets that may use the curated-basket launcher. */
export const CURATOR_WALLETS = ["0x3bf281e89d095f4afb96b96c4fa5aa14e9553352"];
