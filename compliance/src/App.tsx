import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { api } from "./api";
type User = { name: string; role: string };
type Boot = { venues: any[]; locations: any[] };
const nav = [
  ["/", "Dashboard"],
  ["/assets", "Assets"],
  ["/pat", "PAT Testing"],
  ["/extinguishers", "Fire Extinguishers"],
  ["/alarm", "Fire Alarm"],
  ["/risk", "Fire Risk Assessments"],
  ["/furnishings", "Soft Furnishings"],
  ["/documents", "Certificates & Documents"],
  ["/locations", "Locations"],
  ["/actions", "Actions / Defects"],
  ["/reports", "Reports"],
  ["/settings", "Settings"],
];
function Login({ done }: { done: (u: User) => void }) {
  const [email, setEmail] = useState("admin@demo.local"),
    [password, setPassword] = useState("ChangeMe!123"),
    [error, setError] = useState("");
  async function submit(e: any) {
    e.preventDefault();
    try {
      const r = await api<any>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("compliance_token", r.token);
      done(r.user);
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <main className="login">
      <section>
        <div className="brandmark">VL</div>
        <p className="eyebrow">Village Limits</p>
        <h1>Compliance Hub</h1>
        <p>Secure venue safety records, inspections and evidence.</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
            />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button>Sign in securely</button>
        </form>
        <small>
          Demo account only — change this password before any shared
          environment.
        </small>
      </section>
    </main>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [boot, setBoot] = useState<Boot | null>(null),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("compliance_token"))
      api<User>("/me")
        .then(setUser)
        .catch(() => localStorage.removeItem("compliance_token"));
  }, []);
  useEffect(() => {
    if (user) api<Boot>("/bootstrap").then(setBoot);
  }, [user]);
  if (!user) return <Login done={setUser} />;
  return (
    <div className="shell">
      <aside className={menu ? "open" : ""}>
        <header>
          <div className="brandmark">VL</div>
          <div>
            <strong>Compliance Hub</strong>
            <small>Village Limits</small>
          </div>
        </header>
        <nav>
          {nav.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setMenu(false)}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <footer>
          <span>{user.name}</span>
          <small>{user.role.replace("_", " ")}</small>
          <button
            className="link"
            onClick={() => {
              localStorage.removeItem("compliance_token");
              setUser(null);
            }}
          >
            Sign out
          </button>
        </footer>
      </aside>
      <main className="content">
        <div className="topbar">
          <button className="menu" onClick={() => setMenu(!menu)}>
            ☰
          </button>
          <span>
            Village Limits <b>• DEMO DATA</b>
          </span>
        </div>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/assets"
            element={
              <Register
                kind="assets"
                title="Asset Register"
                boot={boot}
                fields={assetFields}
              />
            }
          />
          <Route path="/pat" element={<Pat boot={boot} />} />
          <Route
            path="/extinguishers"
            element={
              <Register
                kind="extinguishers"
                title="Fire Extinguishers"
                boot={boot}
                fields={extFields}
              />
            }
          />
          <Route
            path="/alarm"
            element={
              <Register
                kind="fire-alarm-tests"
                title="Weekly Fire Alarm Tests"
                boot={boot}
                fields={alarmFields}
              />
            }
          />
          <Route
            path="/risk"
            element={
              <Register
                kind="risk-assessments"
                title="Fire Risk Assessments"
                boot={boot}
                fields={riskFields}
              />
            }
          />
          <Route
            path="/furnishings"
            element={
              <Register
                kind="furnishings"
                title="Soft Furnishings"
                boot={boot}
                fields={furnFields}
              />
            }
          />
          <Route
            path="/documents"
            element={
              <Register
                kind="documents"
                title="Certificates & Documents"
                boot={boot}
                fields={docFields}
              />
            }
          />
          <Route
            path="/actions"
            element={
              <Register
                kind="actions"
                title="Actions & Defects"
                boot={boot}
                fields={actionFields}
              />
            }
          />
          <Route path="/locations" element={<Locations boot={boot} />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
function Dashboard() {
  const [d, setD] = useState<any>();
  useEffect(() => {
    api("/dashboard").then(setD);
  }, []);
  if (!d) return <Loader />;
  const cards = [
    ["PAT overdue", d.patOverdue, "red"],
    ["PAT due soon", d.patDueSoon, "amber"],
    ["Open actions", d.openActions, d.openActions ? "amber" : "green"],
    ["Expired certificates", d.expiredDocuments, "red"],
    ["PAT required", d.patRequired, "green"],
    ["Extinguishers", d.extinguishers, "green"],
    ["Furnishing evidence", d.furnishingEvidence, "amber"],
    ["Total assets", d.assets, "green"],
  ];
  return (
    <Page
      title="Compliance overview"
      subtitle="Today’s priorities across Village Limits"
    >
      <div className="quick">
        <NavLink to="/assets?scan=1">Scan barcode</NavLink>
        <NavLink to="/assets?new=1">Add asset</NavLink>
        <NavLink to="/pat">Record PAT test</NavLink>
        <NavLink to="/extinguishers">Check extinguisher</NavLink>
        <NavLink to="/alarm">Weekly alarm test</NavLink>
      </div>
      <div className="cards">
        {cards.map((c) => (
          <article className={"card " + c[2]} key={c[0]}>
            <span>{c[0]}</span>
            <strong>{c[1]}</strong>
          </article>
        ))}
      </div>
      <section className="panel">
        <h2>Audit-ready by design</h2>
        <p>
          Inspection records are appended to immutable history. Updates to
          registers produce audit events recording the user, time, previous
          state and new state.
        </p>
      </section>
    </Page>
  );
}
type Field = { key: string; label: string; type?: string; options?: string[] };
function Register({
  kind,
  title,
  boot,
  fields,
}: {
  kind: string;
  title: string;
  boot: Boot | null;
  fields: Field[];
}) {
  const [items, setItems] = useState<any[]>([]),
    [editing, setEditing] = useState<any | null>(null),
    [error, setError] = useState("");
  const load = () => api<any[]>("/" + kind).then(setItems);
  useEffect(() => {
    void load();
  }, [kind]);
  async function save(e: any) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget),
      body: Object = {};
    for (const f of fields) {
      const v = fd.get(f.key);
      if (v !== "")
        Object.assign(body, { [f.key]: f.type === "number" ? Number(v) : v });
    }
    try {
      await api("/" + kind + (editing?.id ? "/" + editing.id : ""), {
        method: editing?.id ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      setEditing(null);
      setError("");
      load();
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <Page
      title={title}
      subtitle={`${items.length} records`}
      actions={
        <button onClick={() => setEditing({ venue_id: boot?.venues[0]?.id })}>
          + Add record
        </button>
      }
    >
      {editing && (
        <section className="panel formpanel">
          <h2>{editing.id ? "Edit" : "New"} record</h2>
          <form className="gridform" onSubmit={save}>
            {fields.map((f) => (
              <FieldInput
                key={f.key}
                f={f}
                value={editing[f.key]}
                boot={boot}
              />
            ))}
            {error && <p className="error">{error}</p>}
            <div className="formactions">
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button>Save record</button>
            </div>
          </form>
        </section>
      )}
      <section className="panel tablewrap">
        <table>
          <thead>
            <tr>
              {fields.slice(0, 5).map((f) => (
                <th key={f.key}>{f.label}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((x) => (
              <tr key={x.id}>
                {fields.slice(0, 5).map((f) => (
                  <td key={f.key}>
                    {f.key === "venue_id"
                      ? x.venue_name
                      : f.key === "location_id"
                        ? x.location_name
                        : String(x[f.key] ?? "—")}
                  </td>
                ))}
                <td>
                  <button className="link" onClick={() => setEditing(x)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length && <Empty />}
      </section>
    </Page>
  );
}
function FieldInput({
  f,
  value,
  boot,
}: {
  f: Field;
  value: any;
  boot: Boot | null;
}) {
  let opts = f.options;
  if (f.key === "venue_id") opts = boot?.venues.map((v) => String(v.id));
  if (f.key === "location_id") opts = boot?.locations.map((l) => String(l.id));
  return (
    <label>
      {f.label}
      {opts ? (
        <select
          name={f.key}
          defaultValue={value || ""}
          required={["venue_id"].includes(f.key)}
        >
          <option value="">Select…</option>
          {opts.map((o, i) => (
            <option value={o} key={o}>
              {f.key === "venue_id"
                ? boot?.venues[i]?.name
                : f.key === "location_id"
                  ? boot?.locations[i]?.name
                  : o}
            </option>
          ))}
        </select>
      ) : f.type === "textarea" ? (
        <textarea name={f.key} defaultValue={value} />
      ) : (
        <input
          name={f.key}
          defaultValue={value}
          type={f.type || "text"}
          required={[
            "barcode",
            "description",
            "type",
            "title",
            "test_datetime",
            "assessment_date",
            "fire_status",
          ].includes(f.key)}
        />
      )}
    </label>
  );
}
function Pat({ boot: _boot }: { boot: Boot | null }) {
  const [assets, setAssets] = useState<any[]>([]),
    [asset, setAsset] = useState<any>(),
    [history, setHistory] = useState<any[]>([]);
  useEffect(() => {
    api<any[]>("/assets").then((a) =>
      setAssets(a.filter((x) => x.pat_status === "PAT Required")),
    );
  }, []);
  useEffect(() => {
    if (asset) api<any[]>(`/assets/${asset.id}/pat-tests`).then(setHistory);
  }, [asset]);
  async function save(e: any) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await api(`/assets/${asset.id}/pat-tests`, {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(f)),
    });
    setAsset({ ...asset });
    e.currentTarget.reset();
  }
  return (
    <Page title="PAT Testing" subtitle="Append-only electrical safety history">
      <section className="panel">
        <label>
          Choose PAT-required asset
          <select
            onChange={(e) =>
              setAsset(assets.find((a) => a.id === Number(e.target.value)))
            }
          >
            <option>Select asset…</option>
            {assets.map((a) => (
              <option value={a.id}>
                {a.barcode} — {a.description}
              </option>
            ))}
          </select>
        </label>
      </section>
      {asset && (
        <>
          <section className="panel">
            <h2>Record new PAT test</h2>
            <form className="gridform" onSubmit={save}>
              <label>
                Result
                <select name="result" required>
                  <option>Pass</option>
                  <option>Fail</option>
                </select>
              </label>
              <label>
                Test date
                <input name="test_date" type="date" required />
              </label>
              <label>
                Next review
                <input name="next_date" type="date" />
              </label>
              <label>
                Tester
                <input name="tester" />
              </label>
              <label className="wide">
                Electrical readings / notes
                <textarea name="readings" />
              </label>
              <button>Save immutable test</button>
            </form>
          </section>
          <section className="panel">
            <h2>Test history</h2>
            {history.map((h) => (
              <p key={h.id}>
                <b className={h.result === "Fail" ? "bad" : ""}>{h.result}</b> ·{" "}
                {h.test_date} · {h.tester || "Unknown tester"} · next{" "}
                {h.next_date || "not set"}
              </p>
            ))}
          </section>
        </>
      )}
    </Page>
  );
}
function Locations({ boot }: { boot: Boot | null }) {
  return (
    <Page title="Locations" subtitle="Configurable dropdown values by venue">
      <section className="panel list">
        {boot?.locations.map((l) => (
          <span key={l.id}>{l.name}</span>
        ))}
      </section>
    </Page>
  );
}
function Reports() {
  const reports = [
    "Full asset register",
    "Assets by location",
    "PAT-required assets",
    "PAT due soon",
    "PAT overdue",
    "PAT failures",
    "Fire extinguisher schedule",
    "Fire alarm test history",
    "Outstanding fire risk actions",
    "Soft furnishings register",
    "Certificates expiring",
    "Open defects/actions",
  ];
  return (
    <Page title="Reports" subtitle="Print-ready operational views">
      <section className="panel list">
        {reports.map((r) => (
          <button className="report" onClick={() => window.print()}>
            {r}
            <span>Print / save PDF →</span>
          </button>
        ))}
      </section>
    </Page>
  );
}
function Settings() {
  return (
    <Page title="Settings" subtitle="Security and service configuration">
      <section className="panel">
        <h2>Environment-backed configuration</h2>
        <p>
          Database, object storage, JWT signing and CORS are configured outside
          source control. User and role administration is restricted to
          administrators.
        </p>
        <p>
          <b>Roles:</b> Administrator · Venue Manager · Staff · Contractor /
          Tester · Read-only Auditor
        </p>
      </section>
    </Page>
  );
}
function Page({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: any;
  children: any;
}) {
  return (
    <>
      <header className="pagehead">
        <div>
          <p className="eyebrow">Compliance Hub</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {actions}
      </header>
      {children}
    </>
  );
}
const Loader = () => <p>Loading…</p>;
const Empty = () => (
  <div className="empty">No records yet. Add the first record to begin.</div>
);
const assetFields: Field[] = [
  { key: "barcode", label: "Barcode / asset no." },
  { key: "description", label: "Description" },
  { key: "category", label: "Category" },
  { key: "venue_id", label: "Venue" },
  { key: "location_id", label: "Location" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "model", label: "Model" },
  { key: "serial_number", label: "Serial number" },
  { key: "purchase_date", label: "Purchase / install date", type: "date" },
  {
    key: "status",
    label: "Status",
    options: ["Active", "Repair", "Missing", "Retired", "Replaced"],
  },
  {
    key: "pat_status",
    label: "PAT status",
    options: ["PAT Required", "PAT Not Required", "Assessment Required"],
  },
  { key: "notes", label: "Notes", type: "textarea" },
];
const extFields: Field[] = [
  { key: "barcode", label: "Barcode / asset ID" },
  {
    key: "type",
    label: "Type",
    options: ["Water", "Foam", "CO2", "Powder", "Wet Chemical", "Other"],
  },
  { key: "capacity", label: "Capacity" },
  { key: "venue_id", label: "Venue" },
  { key: "location_id", label: "Location" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "model", label: "Model" },
  { key: "serial_number", label: "Serial no." },
  {
    key: "status",
    label: "Status",
    options: ["In Service", "Removed", "Replaced", "Missing"],
  },
  { key: "last_service_date", label: "Last service", type: "date" },
  { key: "next_service_date", label: "Next service", type: "date" },
  { key: "notes", label: "Notes", type: "textarea" },
];
const alarmFields: Field[] = [
  { key: "test_datetime", label: "Date / time", type: "datetime-local" },
  { key: "call_point", label: "Call point" },
  { key: "zone", label: "Zone" },
  { key: "result", label: "Result", options: ["Pass", "Fail"] },
  { key: "venue_id", label: "Venue" },
  { key: "sounder_result", label: "Sounder result" },
  { key: "equipment_result", label: "Connected equipment" },
  { key: "completed_by", label: "Completed by" },
  { key: "faults", label: "Faults", type: "textarea" },
  { key: "notes", label: "Notes", type: "textarea" },
];
const riskFields: Field[] = [
  { key: "assessment_date", label: "Assessment date", type: "date" },
  { key: "assessor", label: "Assessor" },
  { key: "review_date", label: "Review date", type: "date" },
  { key: "venue_id", label: "Venue" },
  { key: "hazards", label: "Fire hazards", type: "textarea" },
  { key: "people_at_risk", label: "People at risk", type: "textarea" },
  { key: "escape_routes", label: "Escape routes", type: "textarea" },
  { key: "detection_warning", label: "Detection / warning", type: "textarea" },
  { key: "notes", label: "Notes", type: "textarea" },
];
const furnFields: Field[] = [
  { key: "description", label: "Description" },
  { key: "quantity", label: "Quantity", type: "number" },
  {
    key: "category",
    label: "Category",
    options: [
      "Chair",
      "Sofa",
      "Curtain",
      "Carpet",
      "Mattress",
      "Headboard",
      "Other",
    ],
  },
  { key: "venue_id", label: "Venue" },
  { key: "location_id", label: "Location" },
  {
    key: "fire_status",
    label: "Fire protection",
    options: [
      "Fire regulated/compliant",
      "Fire-retardant treated",
      "Not applicable",
      "Evidence required",
      "Requires assessment",
    ],
  },
  { key: "supplier", label: "Manufacturer / supplier" },
  { key: "treatment_product", label: "Treatment / product" },
  { key: "treatment_date", label: "Treatment date", type: "date" },
  { key: "next_review_date", label: "Next review", type: "date" },
  { key: "notes", label: "Notes", type: "textarea" },
];
const docFields: Field[] = [
  { key: "title", label: "Title" },
  {
    key: "type",
    label: "Type",
    options: [
      "Fire alarm service certificate",
      "Fire extinguisher certificate",
      "Emergency lighting certificate",
      "Fire risk assessment",
      "Fire-retardant treatment certificate",
      "Fire door report",
      "PAT certificate",
      "Other",
    ],
  },
  { key: "reference", label: "Reference" },
  { key: "venue_id", label: "Venue" },
  { key: "issue_date", label: "Issue date", type: "date" },
  { key: "review_date", label: "Expiry / review", type: "date" },
  { key: "issuer", label: "Contractor / issuer" },
  { key: "notes", label: "Notes", type: "textarea" },
];
const actionFields: Field[] = [
  { key: "description", label: "Description" },
  {
    key: "priority",
    label: "Priority",
    options: ["Low", "Medium", "High", "Critical"],
  },
  {
    key: "status",
    label: "Status",
    options: ["Open", "In Progress", "Complete", "Closed"],
  },
  { key: "venue_id", label: "Venue" },
  { key: "location_id", label: "Location" },
  { key: "responsible_person", label: "Responsible person" },
  { key: "due_date", label: "Due date", type: "date" },
  { key: "completion_notes", label: "Completion notes", type: "textarea" },
];
