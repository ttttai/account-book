// 他機能へ公開する純関数。確認間隔と自動反映画面の判定を同じ規則で参照できるようにする (SYNC-005)
export {
  BASE_CHECK_INTERVAL_MS,
  isAutoRefreshPath,
} from "./domain/sync-policy";
