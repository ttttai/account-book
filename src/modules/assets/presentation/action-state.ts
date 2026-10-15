export type AssetActionState = Readonly<{
  status: "idle" | "success" | "error";
  message?: string;
  /** 入力欄ごとのエラー。keyは`name`または`memberId:categoryId` */
  fieldErrors?: Readonly<Record<string, readonly string[]>>;
}>;

export const initialAssetActionState: AssetActionState = { status: "idle" };
