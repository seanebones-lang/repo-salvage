"use client";
import { useActionState } from "react";
import { issue, type CredentialState } from "./actions";
export default function CredentialForm({
  repos,
}: {
  repos: { id: number; full_name: string }[];
}) {
  const [state, action, pending] = useActionState<CredentialState, FormData>(
    issue,
    null,
  );
  return (
    <form action={action} className="repo-form credential-form">
      <label htmlFor="credential-name">Credential name</label>
      <input
        id="credential-name"
        name="name"
        maxLength={80}
        required
        placeholder="My coding agent"
      />
      <label htmlFor="credential-hours">Expires in</label>
      <select id="credential-hours" name="hours" defaultValue="1">
        <option value="1">1 hour</option>
        <option value="24">24 hours</option>
        <option value="168">7 days</option>
      </select>
      <fieldset>
        <legend>Allowed public repositories (choose up to 20)</legend>
        {repos.map((repo) => (
          <label key={repo.id} className="credential-repo">
            <input type="checkbox" name="repoId" value={repo.id} />{" "}
            {repo.full_name}
          </label>
        ))}
        {!repos.length && (
          <p>
            No eligible repositories could be loaded. A recognized license is
            required.
          </p>
        )}
      </fieldset>
      <button
        className="button button-primary"
        disabled={pending || !repos.length}
      >
        {pending ? "Checking repositories…" : "Create draft credential"}
      </button>
      {state?.error && (
        <p className="err" role="alert">
          {state.error}
        </p>
      )}
      {state?.token && (
        <div className="notice" role="status">
          <strong>Copy this credential now.</strong>
          <p>
            It is shown in this response only. Store it in your agent's secret
            environment as REPO_SALVAGE_TOKEN. It expires{" "}
            {new Date(state.expires_at!).toISOString()}. Refresh this page after
            copying to clear the displayed value.
          </p>
          <pre style={{ overflowX: "auto" }}>{state.token}</pre>
        </div>
      )}
    </form>
  );
}
