import { z } from "zod";

// Field lists follow docs/binance-notes.md (sourced from the official connector types).
// Optional in the connector => nullish here. Unknown extra fields are ignored.

const str = z.string();
const optStr = z.string().nullish();
const ms = z.union([z.number(), z.string()]).nullish();

export const rwaStatusInfo = z.object({
  openState: z.boolean().nullish(),
  marketStatus: optStr,
  reasonCode: optStr,
  reasonMsg: optStr,
  nextOpenTime: ms,
  nextCloseTime: ms,
});

export const rwaPlatform = z.object({
  platformId: str,
  tickerCount: z.number().nullish(),
  website: optStr,
  logoUrl: optStr,
});
export const rwaPlatforms = z.array(rwaPlatform);

export const rwaToken = z.object({
  binanceChainId: str,
  tokenContractAddress: str,
  platformId: str,
  assetType: z.number().nullish(),
  tokenName: optStr,
  tokenSymbol: str,
  tokenLogoUrl: optStr,
  decimals: z.union([z.string(), z.number()]).nullish(),
  underlyingTicker: optStr,
  underlyingName: optStr,
  tokenToShareRatio: optStr,
  statusInfo: rwaStatusInfo.nullish(),
  tokenPrice: optStr,
  referencePrice: optStr,
  volume24H: optStr,
  marketCap: optStr,
  peRatioTTM: optStr,
});
export const rwaTokens = z.array(rwaToken);
export type RwaToken = z.infer<typeof rwaToken>;

export const rwaPrice = z.object({
  binanceChainId: str,
  tokenContractAddress: str,
  platformId: optStr,
  tokenPrice: optStr,
  referencePrice: optStr,
  tokenPriceUpdatedAt: ms,
});
export const rwaPrices = z.array(rwaPrice);
export type RwaPrice = z.infer<typeof rwaPrice>;

export const rwaSearch = z.array(
  z.object({
    ticker: optStr,
    companyName: optStr,
    assets: z
      .array(
        z.object({
          platformId: str,
          binanceChainId: str,
          tokenContractAddress: str,
          tokenSymbol: optStr,
          assetType: z.number().nullish(),
        }),
      )
      .nullish(),
  }),
);

export const rwaUnderlyingMarket = z.object({
  statusInfo: rwaStatusInfo.nullish(),
  marketData: z
    .object({
      referencePrice: optStr,
      high52W: optStr,
      low52W: optStr,
      marketCap: optStr,
      totalShares: optStr,
      peRatioTTM: optStr,
      dividendYield: optStr,
    })
    .nullish(),
});

/**
 * [open, high, low, close, volume, timestampMs, tradeCount]. The docs say all seven are numbers,
 * but live responses sometimes carry null tradeCount (binance-notes §6); we don't use it.
 */
const candleNum = z.union([z.number(), z.string()]);
export const candles = z.array(z.tuple([candleNum, candleNum, candleNum, candleNum, candleNum, candleNum]).rest(z.union([z.number(), z.string(), z.null()])));

const quoteToken = z.object({
  tokenContractAddress: str,
  tokenSymbol: optStr,
  tokenUnitPrice: optStr,
  decimal: z.union([z.string(), z.number()]).nullish(),
});

export const quoteRoute = z.object({
  quoteId: str,
  vendorName: str,
  binanceChainId: optStr,
  fromTokenAmount: str,
  toTokenAmount: str,
  tradeFee: optStr,
  estimateGasFee: optStr,
  priceImpactPercent: optStr,
  executionMode: z.enum(["SWAP", "RFQ"]),
  approveTarget: optStr,
  isBest: z.boolean().nullish(),
  fromToken: quoteToken.nullish(),
  toToken: quoteToken.nullish(),
});
export const quoteRoutes = z.array(quoteRoute);
export type QuoteRoute = z.infer<typeof quoteRoute>;

export const approveTxs = z.array(
  z.object({
    data: str,
    dexContractAddress: str,
    gasLimit: optStr,
    gasPrice: optStr,
  }),
);

export const swapBuild = z.object({
  executionMode: z.enum(["SWAP", "RFQ"]),
  tx: z
    .object({
      from: str,
      to: str,
      data: str,
      value: optStr,
      gas: optStr,
      gasPrice: optStr,
      maxPriorityFeePerGas: optStr,
      minReceiveAmount: optStr,
      slippagePercent: optStr,
    })
    .nullish(),
  rfq: z
    .object({
      vendor: str,
      txType: optStr,
      typedDataToSign: str,
      signingScheme: optStr,
      // Both the integration flow doc and the connector's submit docs say to submit `rfq.orderId`
      // as `quoteId`, but the connector's response type doesn't declare the field. Optional here;
      // the caller fails loudly if it's missing (docs/binance-notes.md §6).
      orderId: optStr,
    })
    .nullish(),
});
export type SwapBuild = z.infer<typeof swapBuild>;

export const rfqSubmit = z.object({
  orderId: str,
  status: optStr,
  createdAt: ms,
});

export const rfqStatus = z.object({
  orderId: str,
  status: str,
  txHash: optStr,
  fromAmount: optStr,
  toAmount: optStr,
  filledAt: ms,
  createdAt: ms,
});
export type RfqStatus = z.infer<typeof rfqStatus>;
