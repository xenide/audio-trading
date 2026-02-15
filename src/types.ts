export interface BinanceTrade {
  e: "trade";
  E: number; // event time
  s: string; // symbol
  t: number; // trade ID
  p: string; // price
  q: string; // quantity
  T: number; // trade time
  m: boolean; // is buyer the maker? (true = taker is selling)
}

export interface TradeEvent {
  price: number;
  quantity: number;
  isSell: boolean;
  timestamp: number;
  tradeId: number;
}

export type ServerMessage =
  | { type: "trade"; data: TradeEvent }
  | { type: "status"; connected: boolean };
