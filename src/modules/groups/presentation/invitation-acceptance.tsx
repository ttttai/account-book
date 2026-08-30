"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { acceptInvitationSchema } from "../domain/invitation-input";
import { acceptInvitationAction } from "./actions";
import { INITIAL_ACCEPT_INVITATION_STATE } from "./invitation-action-state";

import styles from "./groups.module.css";

const STORAGE_KEY = "account-book.pending-invitation-token";

function AcceptButton() {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button" disabled={pending} type="submit">
      {pending ? "参加中…" : "このグループに参加"}
    </button>
  );
}

// 招待受諾画面。URLフラグメントのトークンを検証し、参加操作を提供する
export function InvitationAcceptance({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [token, setToken] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [state, formAction] = useActionState(
    acceptInvitationAction,
    INITIAL_ACCEPT_INVITATION_STATE,
  );

  useEffect(() => {
    // フラグメント優先でトークンを取得し、ログイン往復に備えてsessionStorageへ退避する
    const fragmentToken = new URLSearchParams(
      window.location.hash.slice(1),
    ).get("token");
    const storedToken = window.sessionStorage.getItem(STORAGE_KEY);
    const candidate = fragmentToken ?? storedToken ?? "";
    const result = acceptInvitationSchema.safeParse({ token: candidate });

    if (result.success) {
      window.sessionStorage.setItem(STORAGE_KEY, result.data.token);
      setToken(result.data.token);
    } else if (fragmentToken) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }

    // トークンを含むフラグメントは履歴に残さないよう即座に消す
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (state.status !== "success" || !state.groupId) return;
    window.sessionStorage.removeItem(STORAGE_KEY);
    router.replace(`/groups/${state.groupId}/members`);
  }, [router, state.groupId, state.status]);

  if (!loaded) {
    return <p className="field-hint">招待リンクを確認しています…</p>;
  }

  if (!token) {
    return (
      <p className="form-message error" role="alert">
        招待リンクが正しくありません。作成者へ新しいリンクを依頼してください。
      </p>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className={styles["invitation-login-prompt"]}>
        <p>参加するには、許可されたGoogleアカウントでログインしてください。</p>
        <Link
          className={`primary-link ${styles["centered-link"]}`}
          href="/login?next=/invitations/accept"
        >
          ログインへ進む
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className={styles["accept-invitation-form"]}>
      <input name="token" type="hidden" value={token} />
      <p>
        参加すると、このグループの家計データをほかのメンバーと共有できます。
      </p>
      <AcceptButton />
      {state.message && (
        <p
          className={`form-message ${state.status === "error" ? "error" : "success"}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
