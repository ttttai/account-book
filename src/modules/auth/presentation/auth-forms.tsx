"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  INITIAL_AUTH_ACTION_STATE,
  type AuthActionState,
  type AuthFieldName,
} from "./action-state";
import { signOutAction, updateProfileAction } from "./actions";

function FieldError({
  state,
  name,
}: {
  state: AuthActionState;
  name: AuthFieldName;
}) {
  const message = state.fieldErrors?.[name]?.[0];
  if (!message) return null;
  return (
    <p className="field-error" id={`${name}-error`}>
      {message}
    </p>
  );
}

function FormMessage({ state }: { state: AuthActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={`form-message ${state.status}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="primary-button" disabled={pending} type="submit">
      {pending ? "処理中…" : children}
    </button>
  );
}

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, action] = useActionState(
    updateProfileAction,
    INITIAL_AUTH_ACTION_STATE,
  );

  return (
    <form action={action} className="profile-form" noValidate>
      <label htmlFor="profileDisplayName">表示名</label>
      <input
        aria-describedby="displayName-error"
        autoComplete="name"
        defaultValue={displayName}
        id="profileDisplayName"
        name="displayName"
      />
      <FieldError name="displayName" state={state} />
      <FormMessage state={state} />
      <SubmitButton>表示名を更新</SubmitButton>
    </form>
  );
}

function LogoutButton() {
  const { pending } = useFormStatus();

  return (
    <button className="text-button" disabled={pending} type="submit">
      {pending ? "ログアウト中…" : "ログアウト"}
    </button>
  );
}

export function LogoutForm() {
  const [state, action] = useActionState(
    signOutAction,
    INITIAL_AUTH_ACTION_STATE,
  );

  return (
    <form action={action} className="logout-form">
      <LogoutButton />
      <FormMessage state={state} />
    </form>
  );
}
