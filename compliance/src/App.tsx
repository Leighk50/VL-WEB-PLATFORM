import { useEffect, useRef, useState } from "react";
import {
  NavLink,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
  type RenderTask,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  api,
  createEvidenceObjectUrl,
  downloadPrivateAttachment,
  evidencePreviewKind,
  fetchPrivateAttachment,
  privateAttachmentUrl,
  privateImageUrl,
  uploadDocumentEvidence,
  uploadPhoto,
} from "./api";
import { evidenceValidationError } from "./evidence";
import {
  clampPdfPage,
  clampPdfZoom,
  sanitizePdfPreviewError,
} from "./pdf-preview";
import { RiskAssessments } from "./RiskAssessments";
import { FoodHygiene } from "./FoodHygiene";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
type User = { name: string; role: string };
type Boot = {
  venues: any[];
  locations: any[];
  documentTypes: any[];
  demoMode: boolean;
};
const nav = [
  ["/", "Dashboard"],
  ["/food-hygiene", "Food Hygiene"],
  ["/assets", "Assets"],
  ["/pat", "PAT Testing"],
  ["/extinguishers", "Fire Extinguishers"],
  ["/alarm", "Fire Alarm"],
  ["/risk", "Risk Assessments"],
  ["/furnishings", "Soft Furnishings"],
  ["/documents", "Certificates & Documents"],
  ["/locations", "Locations"],
  ["/actions", "Actions / Defects"],
  ["/reports", "Reports"],
  ["/settings", "Settings"],
];
function Login({ done }: { done: (u: User) => void }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
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
        <small>Authorized Village Limits users only.</small>
      </section>
    </main>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [boot, setBoot] = useState<Boot | null>(null),
    [menu, setMenu] = useState(false);
  const location = useLocation();
  const menuButton = useRef<HTMLButtonElement>(null);
  const currentPage =
    nav.find(([to]) =>
      to === "/" ? location.pathname === "/" : location.pathname.startsWith(to),
    )?.[1] || "Compliance Hub";
  useEffect(() => {
    if (localStorage.getItem("compliance_token"))
      api<User>("/me")
        .then(setUser)
        .catch(() => localStorage.removeItem("compliance_token"));
  }, []);
  useEffect(() => {
    if (user) api<Boot>("/bootstrap").then(setBoot);
  }, [user]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menu]);
  if (!user) return <Login done={setUser} />;
  return (
    <div className="shell">
      <aside
        id="primary-navigation"
        className={menu ? "open" : ""}
        aria-label="Primary navigation"
      >
        <header>
          <div className="brandmark">VL</div>
          <div>
            <strong>Compliance Hub</strong>
            <small>Village Limits</small>
          </div>
          <button
            className="nav-close"
            aria-label="Close navigation"
            onClick={() => {
              setMenu(false);
              menuButton.current?.focus();
            }}
          >
            ×
          </button>
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
      {menu && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <main className="content">
        <div className="topbar">
          <button
            ref={menuButton}
            className="menu"
            aria-label="Open navigation"
            aria-controls="primary-navigation"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          <strong className="mobile-page-title">{currentPage}</strong>
          <span className="venue-label">
            Village Limits {boot?.demoMode && <b>• DEMO DATA</b>}
          </span>
        </div>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/food-hygiene/*"
            element={<FoodHygiene boot={boot} user={user} />}
          />
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
            element={<ExtinguisherPage boot={boot} />}
          />
          <Route
            path="/alarm"
            element={<FireAlarm boot={boot} user={user} />}
          />
          <Route
            path="/risk"
            element={<RiskAssessments boot={boot} user={user} />}
          />
          <Route
            path="/risk/:assessmentId"
            element={<RiskAssessments boot={boot} user={user} />}
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
            element={<CertificatesDocuments boot={boot} />}
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
          <Route
            path="/settings"
            element={<Settings boot={boot} user={user} />}
          />
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
    ["Certificates due soon", d.documentsDueSoon, "amber"],
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
    [error, setError] = useState(""),
    [scanning, setScanning] = useState(
      kind === "assets" &&
        new URLSearchParams(window.location.search).has("scan"),
    );
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
      const saved = await api<any>(
        "/" + kind + (editing?.id ? "/" + editing.id : ""),
        {
          method: editing?.id ? "PATCH" : "POST",
          body: JSON.stringify(body),
        },
      );
      setEditing(["assets", "furnishings"].includes(kind) ? saved : null);
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
        <div className="pageactions">
          {kind === "assets" && (
            <button className="secondary" onClick={() => setScanning(true)}>
              Scan barcode
            </button>
          )}
          <button onClick={() => setEditing({ venue_id: boot?.venues[0]?.id })}>
            + Add record
          </button>
        </div>
      }
    >
      {scanning && (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onCode={async (barcode) => {
            try {
              const asset = await api<any>(
                `/assets/barcode/${encodeURIComponent(barcode)}`,
              );
              setEditing(asset);
            } catch (error) {
              if (error instanceof Error && error.message === "Unknown barcode")
                setEditing({ barcode, venue_id: boot?.venues[0]?.id });
              else
                setError(
                  error instanceof Error
                    ? error.message
                    : "Barcode lookup failed",
                );
            }
            setScanning(false);
          }}
        />
      )}
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
          {editing.id && ["assets", "furnishings"].includes(kind) && (
            <PhotoManager entityType={kind} entityId={editing.id} />
          )}
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
                  <td key={f.key} data-label={f.label}>
                    {f.key === "venue_id"
                      ? x.venue_name
                      : f.key === "location_id"
                        ? x.location_name
                        : String(x[f.key] ?? "—")}
                  </td>
                ))}
                <td data-label="Actions">
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
  if (f.key === "type" && boot?.documentTypes?.length)
    opts = boot.documentTypes.map((item) => item.name);
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
function BarcodeScanner({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    [manual, setManual] = useState(""),
    [message, setMessage] = useState("Requesting camera permission…");
  useEffect(() => {
    let stream: MediaStream | undefined,
      timer: number | undefined,
      stopped = false;
    async function start() {
      const Detector = (window as any).BarcodeDetector;
      if (!Detector) {
        setMessage(
          "Camera barcode detection is not supported by this browser. Enter the barcode manually.",
        );
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!video.current || stopped) return;
        video.current.srcObject = stream;
        await video.current.play();
        setMessage("Point the camera at the barcode.");
        const detector = new Detector({
          formats: ["code_128", "code_39", "ean_13", "ean_8", "qr_code"],
        });
        timer = window.setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          try {
            const found = await detector.detect(video.current);
            if (found[0]?.rawValue) {
              window.clearInterval(timer);
              onCode(found[0].rawValue);
            }
          } catch {
            /* retry next frame */
          }
        }, 450);
      } catch (error) {
        setMessage(
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access or enter the barcode manually."
            : "The camera could not be started. Enter the barcode manually.",
        );
      }
    }
    void start();
    return () => {
      stopped = true;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onCode]);
  return (
    <section className="panel scanner">
      <div className="sectionhead">
        <h2>Scan asset barcode</h2>
        <button className="secondary" onClick={onClose}>
          Close
        </button>
      </div>
      <video ref={video} playsInline muted />
      <p>{message}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onCode(manual.trim());
        }}
      >
        <label>
          Manual barcode
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            autoFocus
          />
        </label>
        <button>Find asset</button>
      </form>
    </section>
  );
}

function CertificatesDocuments({ boot }: { boot: Boot | null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedDocumentId = Number(
    searchParams.get("document") ||
      localStorage.getItem("compliance_selected_document") ||
      0,
  );
  const [documents, setDocuments] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(),
    [creating, setCreating] = useState(false),
    [venueId, setVenueId] = useState<number>(),
    [error, setError] = useState("");
  const openDocument = (document: any) => {
    setSelected(document);
    setCreating(false);
    localStorage.setItem("compliance_selected_document", String(document.id));
    setSearchParams({ document: String(document.id) });
  };
  const closeDocument = () => {
    setSelected(undefined);
    localStorage.removeItem("compliance_selected_document");
    setSearchParams({});
  };
  const load = async () => {
    const list = await api<any[]>("/documents");
    setDocuments(list);
    if (requestedDocumentId) {
      const saved = list.find(
        (document) => document.id === requestedDocumentId,
      );
      if (saved) setSelected(saved);
    }
  };
  useEffect(() => {
    void load();
    if (!venueId && boot?.venues[0]?.id) setVenueId(boot.venues[0].id);
  }, [boot, requestedDocumentId]);
  async function save(event: any) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body: any = {
      venue_id: Number(values.venue_id),
      type: values.type,
      title: values.title,
    };
    for (const key of [
      "issuer",
      "reference",
      "issue_date",
      "review_date",
      "notes",
    ])
      if (values[key]) body[key] = values[key];
    if (values.location_id) body.location_id = Number(values.location_id);
    try {
      const saved = await api<any>("/documents", {
        method: "POST",
        body: JSON.stringify(body),
      });
      openDocument(saved);
      setCreating(false);
      setError("");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Document could not be saved",
      );
    }
  }
  return (
    <Page
      title="Certificates & Documents"
      subtitle={`${documents.length} certificate/document records`}
      actions={
        <button
          onClick={() => {
            closeDocument();
            setCreating(true);
          }}
        >
          + Add certificate / document
        </button>
      }
    >
      {creating && (
        <section className="panel formpanel">
          <h2>New certificate / document</h2>
          <form className="gridform" onSubmit={save}>
            <label>
              Document type
              <select name="type" required>
                <option value="">Select document type…</option>
                {boot?.documentTypes.map((type) => (
                  <option key={type.id} value={type.name}>
                    {type.name}
                  </option>
                ))}
                {!boot?.documentTypes.length && (
                  <option value="Other">Other</option>
                )}
              </select>
            </label>
            <label>
              Title
              <input name="title" required />
            </label>
            <label>
              Contractor / provider
              <input name="issuer" />
            </label>
            <label>
              Certificate / reference number
              <input name="reference" />
            </label>
            <label>
              Issue date
              <input name="issue_date" type="date" />
            </label>
            <label>
              Expiry / review date
              <input name="review_date" type="date" />
            </label>
            <label>
              Venue
              <select
                name="venue_id"
                value={venueId || ""}
                onChange={(event) => setVenueId(Number(event.target.value))}
                required
              >
                <option value="">Select venue…</option>
                {boot?.venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Location
              <select name="location_id">
                <option value="">No specific location</option>
                {boot?.locations
                  .filter((location) => location.venue_id === venueId)
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="wide">
              Notes
              <textarea name="notes" />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="formactions">
              <button
                type="button"
                className="secondary"
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button>Save document</button>
            </div>
          </form>
        </section>
      )}
      {selected && (
        <section className="panel document-detail">
          <div className="sectionhead">
            <div>
              <h2>{selected.title}</h2>
              <p>
                {selected.type} · {selected.reference || "No reference number"}
              </p>
            </div>
            <button
              className="secondary"
              onClick={() => {
                closeDocument();
              }}
            >
              Close
            </button>
          </div>
          <div className="version-links">
            <b>Version {selected.version || 1}</b>
            {selected.previous_version_id && (
              <button
                className="link"
                onClick={() => {
                  const previous = documents.find(
                    (item) => item.id === selected.previous_version_id,
                  );
                  if (previous) openDocument(previous);
                }}
              >
                View previous version and evidence
              </button>
            )}
            {documents
              .filter((item) => item.previous_version_id === selected.id)
              .map((renewal) => (
                <button
                  key={renewal.id}
                  className="link"
                  onClick={() => openDocument(renewal)}
                >
                  View renewed version {renewal.version || 1}
                </button>
              ))}
          </div>
          <DocumentEvidence
            document={selected}
            onRenewed={(renewed) => {
              openDocument(renewed);
              void load();
            }}
            onChanged={load}
          />
        </section>
      )}
      <section className="panel tablewrap">
        <table>
          <thead>
            <tr>
              <th>Type / title</th>
              <th>Provider / reference</th>
              <th>Expiry / review</th>
              <th>Venue</th>
              <th>Evidence</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr key={document.id}>
                <td data-label="Type / title">
                  <b>{document.title}</b>
                  <br />
                  <small>{document.type}</small>
                </td>
                <td data-label="Provider / reference">
                  {document.issuer || "—"}
                  <br />
                  <small>{document.reference || "No reference"}</small>
                </td>
                <td data-label="Expiry / review">
                  {document.review_date || "Not set"}
                </td>
                <td data-label="Venue">{document.venue_name}</td>
                <td data-label="Evidence">
                  <b>{Number(document.attachment_count)} attachments</b>
                </td>
                <td data-label="Actions">
                  <div className="record-actions">
                    <button
                      className="link"
                      onClick={() => openDocument(document)}
                    >
                      View
                    </button>
                    <button
                      className="link"
                      onClick={() => openDocument(document)}
                    >
                      {Number(document.attachment_count)
                        ? "View / Add Evidence"
                        : "Add Evidence"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!documents.length && <Empty />}
      </section>
    </Page>
  );
}

function DocumentEvidence({
  document,
  onRenewed,
  onChanged,
}: {
  document: any;
  onRenewed: (renewed: any) => void;
  onChanged: () => void;
}) {
  const thumbnailUrls = useRef<string[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]),
    [urls, setUrls] = useState<Record<number, string>>({}),
    [links, setLinks] = useState<any[]>([]),
    [message, setMessage] = useState(""),
    [preview, setPreview] = useState<any>();
  const load = async () => {
    const list = await api<any[]>(`/documents/${document.id}/attachments`);
    setAttachments(list);
    setLinks(await api<any[]>(`/documents/${document.id}/links`));
    const imageFiles = list.filter((item) =>
      item.mime_type.startsWith("image/"),
    );
    const pairs = await Promise.all(
      imageFiles.map(
        async (item) => [item.id, await privateAttachmentUrl(item.id)] as const,
      ),
    );
    thumbnailUrls.current.forEach(URL.revokeObjectURL);
    thumbnailUrls.current = pairs.map(([, url]) => url);
    setUrls(Object.fromEntries(pairs));
  };
  useEffect(() => {
    void load();
    return () => {
      thumbnailUrls.current.forEach(URL.revokeObjectURL);
      thumbnailUrls.current = [];
    };
  }, [document.id]);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    const validationError = evidenceValidationError(selectedFiles);
    if (validationError) return setMessage(validationError);
    try {
      await uploadDocumentEvidence(document.id, selectedFiles);
      setMessage("Evidence uploaded securely.");
      await load();
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    }
  }
  async function renew() {
    const body = {
      venue_id: document.venue_id,
      location_id: document.location_id || null,
      type: document.type,
      title: document.title,
      reference: document.reference || null,
      issue_date: document.issue_date || null,
      review_date: document.review_date || null,
      issuer: document.issuer || null,
      notes: document.notes || null,
      version: Number(document.version || 1) + 1,
      previous_version_id: document.id,
    };
    const renewed = await api<any>("/documents", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setMessage(
      "Renewal created as a new record; previous evidence was retained.",
    );
    onRenewed(renewed);
  }
  return (
    <div className="document-evidence">
      <div className="sectionhead">
        <div>
          <p className="eyebrow">Private, authenticated storage</p>
          <h2>Certificate / Document Evidence</h2>
        </div>
        <button type="button" className="secondary" onClick={renew}>
          Renew as new version
        </button>
      </div>
      <div className="photoactions">
        <label className="upload">
          Upload PDF or photo
          <input
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
            onChange={(event) => void upload(event.target.files)}
          />
        </label>
        <label className="upload secondary">
          Take Photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => void upload(event.target.files)}
          />
        </label>
      </div>
      <small>
        PDF, JPG/JPEG, PNG, HEIC or HEIF · maximum 15 MB per file · select up to
        10 files
      </small>
      {message && (
        <p
          className={
            message.includes("uploaded securely") ? "success" : "error"
          }
        >
          {message}
        </p>
      )}
      {!attachments.length && (
        <div className="empty">
          No certificate/document evidence uploaded yet
        </div>
      )}
      <div className="evidencegrid">
        {attachments.map((item) => (
          <article key={item.id}>
            {urls[item.id] && (
              <button
                type="button"
                className="evidence-thumbnail"
                onClick={() => setPreview(item)}
                aria-label={`Preview ${item.original_name}`}
              >
                <img src={urls[item.id]} alt={item.original_name} />
              </button>
            )}
            {item.mime_type === "application/pdf" && (
              <div className="pdf-label" aria-label="PDF document">
                PDF
              </div>
            )}
            <strong>{item.original_name}</strong>
            <small>
              {item.mime_type} · {(Number(item.file_size) / 1024).toFixed(1)} KB
              · {new Date(item.created_at).toLocaleString()} ·{" "}
              {item.uploaded_by || "Unknown user"}
            </small>
            <div className="evidence-actions">
              {urls[item.id] && (
                <button
                  type="button"
                  className="link"
                  onClick={() => setPreview(item)}
                >
                  View
                </button>
              )}
              <button
                type="button"
                className="link"
                onClick={async () => {
                  setPreview(item);
                }}
              >
                {urls[item.id] ? "Open full size" : "View / Open"}
              </button>
              <button
                type="button"
                className="link"
                onClick={async () => {
                  try {
                    await downloadPrivateAttachment(
                      item.id,
                      item.original_name,
                    );
                    setMessage("");
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Evidence download failed",
                    );
                  }
                }}
              >
                Download
              </button>
            </div>
          </article>
        ))}
      </div>
      {preview && (
        <EvidenceViewer
          attachment={preview}
          onClose={() => setPreview(undefined)}
        />
      )}
      <h3>Linked compliance registers</h3>
      <form
        className="inlineform"
        onSubmit={async (event: any) => {
          event.preventDefault();
          const form = event.currentTarget;
          const values = Object.fromEntries(new FormData(form));
          await api(`/documents/${document.id}/links`, {
            method: "POST",
            body: JSON.stringify({
              entity_type: values.entity_type,
              entity_id: Number(values.entity_id),
            }),
          });
          form.reset();
          await load();
        }}
      >
        <label>
          Register
          <select name="entity_type" required>
            <option value="pat_test">PAT Testing</option>
            <option value="extinguisher">Fire Extinguishers</option>
            <option value="fire_alarm_test">Fire Alarm</option>
            <option value="risk_assessment">Fire Risk Assessment</option>
            <option value="furnishing">Soft Furnishings</option>
          </select>
        </label>
        <label>
          Record ID
          <input name="entity_id" type="number" min="1" required />
        </label>
        <button>Link record</button>
      </form>
      <div className="list">
        {links.map((link) => (
          <span key={link.id}>
            {String(link.entity_type).replaceAll("_", " ")} #{link.entity_id}
          </span>
        ))}
      </div>
      <small>
        Evidence is append-only. Renewals and replacements retain earlier
        records and files.
      </small>
    </div>
  );
}

function EvidenceViewer({
  attachment,
  onClose,
}: {
  attachment: any;
  onClose: () => void;
}) {
  const [state, setState] = useState<{
    loading: boolean;
    url?: string;
    blob?: Blob;
    kind?: "pdf" | "image" | "unavailable";
    error?: string;
  }>({ loading: true });
  const [downloadError, setDownloadError] = useState("");
  useEffect(() => {
    let active = true;
    let release: (() => void) | undefined;
    setState({ loading: true });
    void fetchPrivateAttachment(attachment.id)
      .then(({ blob, contentType }) => {
        if (!active) return;
        const kind = evidencePreviewKind(contentType || attachment.mime_type);
        const objectUrl =
          kind === "image" ? createEvidenceObjectUrl(blob) : undefined;
        release = objectUrl?.revoke;
        setState({
          loading: false,
          url: objectUrl?.url,
          blob,
          kind,
        });
      })
      .catch((error) => {
        if (active)
          setState({
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Evidence could not be loaded",
          });
      });
    return () => {
      active = false;
      release?.();
    };
  }, [attachment.id]);
  async function download() {
    try {
      setDownloadError("");
      await downloadPrivateAttachment(attachment.id, attachment.original_name);
    } catch (error) {
      setDownloadError(
        error instanceof Error ? error.message : "Evidence download failed",
      );
    }
  }
  return (
    <div className="evidence-viewer" role="dialog" aria-modal="true">
      <section>
        <header className="sectionhead">
          <div>
            <h2>{attachment.original_name}</h2>
            <p>{attachment.mime_type}</p>
          </div>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="viewer-body">
          {state.loading && (
            <p className="viewer-message">Loading certificate…</p>
          )}
          {state.error && <p className="error">{state.error}</p>}
          {state.blob && state.kind === "pdf" && (
            <PdfEvidencePreview
              blob={state.blob}
              attachmentId={attachment.id}
              filename={attachment.original_name}
            />
          )}
          {state.url && state.kind === "image" && (
            <img
              src={state.url}
              alt={attachment.original_name}
              onError={() =>
                setState((current) => ({ ...current, kind: "unavailable" }))
              }
            />
          )}
          {state.kind === "unavailable" && (
            <div className="viewer-message">
              <b>{attachment.original_name}</b>
              <p>Preview unavailable for this file type</p>
            </div>
          )}
        </div>
        <footer className="evidence-actions">
          <button onClick={() => void download()}>Download</button>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
          {downloadError && <p className="error">{downloadError}</p>}
        </footer>
      </section>
    </div>
  );
}

function PdfEvidencePreview({
  blob,
  attachmentId,
  filename,
}: {
  blob: Blob;
  attachmentId: number;
  filename: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadingTaskPromise = blob
      .arrayBuffer()
      .then((bytes) => getDocument({ data: new Uint8Array(bytes) }));
    void loadingTaskPromise
      .then((loadingTask) => loadingTask.promise)
      .then((document) => {
        if (!active) return void document.destroy();
        setPdf(document);
        setPageNumber(1);
        setLoading(false);
      })
      .catch((caught) => {
        if (!active) return;
        const message = sanitizePdfPreviewError(caught);
        console.error("Certificate PDF preview failed", {
          attachmentId,
          filename,
          error: message,
        });
        setError(message || "Unknown PDF rendering error");
        setLoading(false);
      });
    return () => {
      active = false;
      void loadingTaskPromise
        .then((task) => task.destroy())
        .catch(() => undefined);
    };
  }, [blob, attachmentId, filename]);

  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let active = true;
    let renderTask: RenderTask | undefined;
    setLoading(true);
    setError("");
    void pdf
      .getPage(pageNumber)
      .then((page) => {
        if (!active || !canvas.current) return;
        const viewport = page.getViewport({ scale: zoom * 1.35 });
        canvas.current.width = Math.floor(viewport.width);
        canvas.current.height = Math.floor(viewport.height);
        renderTask = page.render({ canvas: canvas.current, viewport });
        return renderTask.promise;
      })
      .then(() => {
        if (active) setLoading(false);
      })
      .catch((caught) => {
        if (
          !active ||
          (caught as { name?: string }).name === "RenderingCancelledException"
        )
          return;
        const message = sanitizePdfPreviewError(caught);
        console.error("Certificate PDF page render failed", {
          attachmentId,
          filename,
          pageNumber,
          error: message,
        });
        setError(message || "Unknown PDF page rendering error");
        setLoading(false);
      });
    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [pdf, pageNumber, zoom, attachmentId, filename]);

  if (error)
    return (
      <div className="viewer-message error">
        <b>Certificate preview failed</b>
        <p>{error}</p>
      </div>
    );
  return (
    <div className="pdf-preview">
      <div className="pdf-controls">
        <button
          className="secondary"
          disabled={!pdf || pageNumber <= 1}
          onClick={() =>
            setPageNumber((page) => clampPdfPage(page - 1, pdf?.numPages || 1))
          }
        >
          Previous
        </button>
        <span>
          Page {pageNumber} / {pdf?.numPages || "…"}
        </span>
        <button
          className="secondary"
          disabled={!pdf || pageNumber >= pdf.numPages}
          onClick={() =>
            setPageNumber((page) => clampPdfPage(page + 1, pdf?.numPages || 1))
          }
        >
          Next
        </button>
        <button
          className="secondary"
          onClick={() => setZoom((value) => clampPdfZoom(value - 0.25))}
        >
          Zoom out
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          className="secondary"
          onClick={() => setZoom((value) => clampPdfZoom(value + 0.25))}
        >
          Zoom in
        </button>
      </div>
      {loading && <p className="viewer-message">Loading certificate…</p>}
      <div className="pdf-canvas-wrap">
        <canvas ref={canvas} aria-label={`Page ${pageNumber} of ${filename}`} />
      </div>
    </div>
  );
}

function FireAlarm({ boot, user }: { boot: Boot | null; user: User }) {
  const [points, setPoints] = useState<any[]>([]),
    [tests, setTests] = useState<any[]>([]),
    [rotation, setRotation] = useState<any>(),
    [editingPoint, setEditingPoint] = useState<any>(),
    [error, setError] = useState("");
  const venueId = boot?.venues[0]?.id;
  const load = async () => {
    const [pointRows, testRows] = await Promise.all([
      api<any[]>("/fire-alarm-call-points"),
      api<any[]>("/fire-alarm-tests"),
    ]);
    setPoints(pointRows);
    setTests(testRows);
    if (venueId)
      setRotation(await api(`/fire-alarm-rotation?venue_id=${venueId}`));
  };
  useEffect(() => {
    void load();
  }, [venueId]);
  async function savePoint(event: any) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    await api(
      `/fire-alarm-call-points${editingPoint?.id ? `/${editingPoint.id}` : ""}`,
      {
        method: editingPoint?.id ? "PATCH" : "POST",
        body: JSON.stringify({
          ...body,
          venue_id: Number(body.venue_id),
          location_id: Number(body.location_id),
          active: Number(body.active),
        }),
      },
    );
    setEditingPoint(undefined);
    await load();
  }
  async function saveTest(event: any) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form),
      photo = data.get("photo") as File;
    const raiseAction = data.get("raise_action") === "on";
    data.delete("photo");
    data.delete("raise_action");
    const body: any = Object.fromEntries(data);
    body.venue_id = Number(body.venue_id);
    body.call_point_id = Number(body.call_point_id);
    for (const key of [
      "alarm_operated",
      "sounders_activated",
      "panel_indication_correct",
      "reset_successful",
    ])
      body[key] = Number(body[key]);
    try {
      const test = await api<any>("/fire-alarm-tests", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (photo?.size)
        await uploadPhoto("fire-alarm-tests", test.id, photo, false);
      if (body.result === "Fail" && raiseAction) {
        const point = points.find((item) => item.id === body.call_point_id);
        await api("/actions", {
          method: "POST",
          body: JSON.stringify({
            description: `Failed weekly fire alarm test at ${point?.code || "call point"}: ${body.faults || "investigation required"}`,
            venue_id: body.venue_id,
            location_id: point?.location_id,
            related_type: "fire_alarm_test",
            related_id: test.id,
            priority: "High",
            status: "Open",
          }),
        });
      }
      form.reset();
      setError("");
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Test could not be saved",
      );
    }
  }
  const flag = (name: string, label: string, optional = false) => (
    <label>
      {label}
      <select name={name} required={!optional}>
        <option value="1">Yes / correct</option>
        <option value="0">No / defect</option>
        {optional && <option value="">Not applicable</option>}
      </select>
    </label>
  );
  return (
    <Page
      title="Fire Alarm"
      subtitle="Call-point register, immutable weekly tests and rotation"
    >
      {rotation && (
        <section className="panel">
          <h2>Call-point rotation</h2>
          <p>
            Suggested next:{" "}
            <b>
              {rotation.nextCallPoint
                ? `${rotation.nextCallPoint.code} — ${rotation.nextCallPoint.description}`
                : "Add an active call point"}
            </b>
          </p>
          <p>
            Warning after {rotation.warningDays} days (configurable in
            Settings).
          </p>
        </section>
      )}
      <section className="panel">
        <h2>Weekly fire alarm test</h2>
        <form className="gridform" onSubmit={saveTest}>
          <input type="hidden" name="venue_id" value={venueId || ""} />
          <label>
            Date / time
            <input name="test_datetime" type="datetime-local" required />
          </label>
          <label>
            Call point
            <select name="call_point_id" required>
              <option value="">Select active call point…</option>
              {points
                .filter((point) => point.active)
                .map((point) => (
                  <option key={point.id} value={point.id}>
                    {point.code} — {point.description} — {point.location_name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Result
            <select name="result">
              <option>Pass</option>
              <option>Fail</option>
            </select>
          </label>
          {flag("alarm_operated", "Alarm operated correctly")}
          {flag("sounders_activated", "Sounders activated", true)}
          {flag("panel_indication_correct", "Panel indication correct", true)}
          {flag("reset_successful", "Reset successful")}
          <label className="wide">
            Faults / comments
            <textarea name="faults" />
          </label>
          <label>
            Evidence photo
            <input
              name="photo"
              type="file"
              accept="image/*"
              capture="environment"
            />
          </label>
          <label className="check">
            <input name="raise_action" type="checkbox" /> Raise an Action/Defect
            if this test fails
          </label>
          {error && <p className="error">{error}</p>}
          <button>Save immutable test</button>
        </form>
      </section>
      <section className="panel tablewrap">
        <h2>Call points</h2>
        {user.role === "administrator" && (
          <button
            onClick={() => setEditingPoint({ venue_id: venueId, active: 1 })}
          >
            + Add call point
          </button>
        )}
        {editingPoint && (
          <>
            <form className="gridform" onSubmit={savePoint}>
              <input
                type="hidden"
                name="venue_id"
                value={editingPoint.venue_id}
              />
              <label>
                Code
                <input name="code" defaultValue={editingPoint.code} required />
              </label>
              <label>
                Description
                <input
                  name="description"
                  defaultValue={editingPoint.description}
                  required
                />
              </label>
              <label>
                Location
                <select
                  name="location_id"
                  defaultValue={editingPoint.location_id || ""}
                  required
                >
                  <option value="">Select…</option>
                  {boot?.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Panel zone
                <input
                  name="panel_zone"
                  defaultValue={editingPoint.panel_zone}
                />
              </label>
              <label>
                Status
                <select name="active" defaultValue={editingPoint.active ?? 1}>
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </select>
              </label>
              <label>
                Notes
                <textarea name="notes" defaultValue={editingPoint.notes} />
              </label>
              <button>Save call point</button>
            </form>
            {editingPoint.id && (
              <PhotoManager
                entityType="fire-alarm-call-points"
                entityId={editingPoint.id}
              />
            )}
          </>
        )}
        <table>
          <thead>
            <tr>
              <th>Code</th>
              <th>Description</th>
              <th>Location</th>
              <th>Last tested</th>
              <th>Tests</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.id}>
                <td data-label="Code">{point.code}</td>
                <td data-label="Description">{point.description}</td>
                <td data-label="Location">{point.location_name}</td>
                <td data-label="Last tested">
                  {point.last_tested_at
                    ? new Date(point.last_tested_at).toLocaleString()
                    : "Never"}
                </td>
                <td data-label="Tests">{point.test_count}</td>
                <td data-label="Status">
                  {point.active ? "Active" : "Inactive"}
                </td>
                <td data-label="Actions">
                  {user.role === "administrator" && (
                    <button
                      className="link"
                      onClick={() => setEditingPoint(point)}
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel">
        <h2>Weekly test history</h2>
        {tests.map((test) => (
          <p key={test.id}>
            <b className={test.result === "Fail" ? "bad" : ""}>{test.result}</b>{" "}
            · {new Date(test.test_datetime).toLocaleString()} ·{" "}
            {points.find((point) => point.id === test.call_point_id)?.code ||
              "Legacy call point"}
          </p>
        ))}
      </section>
    </Page>
  );
}

function PhotoManager({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: number;
}) {
  const [photos, setPhotos] = useState<any[]>([]),
    [urls, setUrls] = useState<Record<number, string>>({}),
    [error, setError] = useState("");
  const load = async () => {
    const list = await api<any[]>(`/${entityType}/${entityId}/photos`);
    setPhotos(list);
    const pairs = await Promise.all(
      list.map(
        async (photo) =>
          [photo.id, await privateImageUrl(photo.storage_key)] as const,
      ),
    );
    setUrls(Object.fromEntries(pairs));
  };
  useEffect(() => {
    void load();
    return () => Object.values(urls).forEach(URL.revokeObjectURL);
  }, [entityType, entityId]);
  async function upload(file: File | undefined, main: boolean) {
    if (!file) return;
    try {
      await uploadPhoto(entityType, entityId, file, main);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }
  return (
    <div className="photos">
      <h3>Identification photographs</h3>
      <div className="photoactions">
        <label className="upload">
          Take/set main photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => void upload(e.target.files?.[0], true)}
          />
        </label>
        <label className="upload secondary">
          Add dated photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => void upload(e.target.files?.[0], false)}
          />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="photogrid">
        {photos.map((photo) => (
          <figure key={photo.id} className={photo.is_main ? "mainphoto" : ""}>
            <img
              src={urls[photo.id]}
              alt={photo.caption || "Compliance evidence"}
            />
            <figcaption>
              {photo.is_main ? "Main · " : ""}
              {new Date(photo.captured_at || photo.created_at).toLocaleString()}
            </figcaption>
            {!photo.is_main && (
              <button
                className="link"
                onClick={async () => {
                  await api(`/photos/${photo.id}/main`, {
                    method: "PATCH",
                    body: "{}",
                  });
                  await load();
                }}
              >
                Set as main
              </button>
            )}
          </figure>
        ))}
      </div>
      <small>
        Changing the main image retains every historical photograph.
      </small>
    </div>
  );
}

function ExtinguisherPage({ boot }: { boot: Boot | null }) {
  return (
    <>
      <Register
        kind="extinguishers"
        title="Fire Extinguishers"
        boot={boot}
        fields={extFields}
      />
      <ExtinguisherCheck />
    </>
  );
}
function ExtinguisherCheck() {
  const [items, setItems] = useState<any[]>([]),
    [item, setItem] = useState<any>(),
    [history, setHistory] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    api<any[]>("/extinguishers").then(setItems);
  }, []);
  const loadHistory = async (selected: any) => {
    setItem(selected);
    if (selected)
      setHistory(await api<any[]>(`/extinguishers/${selected.id}/checks`));
  };
  async function save(e: any) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form),
      file = data.get("photo") as File;
    data.delete("photo");
    const body = Object.fromEntries(data);
    try {
      const check = await api<any>(`/extinguishers/${item.id}/checks`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (file?.size)
        await uploadPhoto("extinguisher_checks", check.id, file, false);
      form.reset();
      await loadHistory(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check could not be saved");
    }
  }
  const yesNo = (name: string, label: string) => (
    <label>
      {label}
      <select name={name} required>
        <option value="1">Satisfactory</option>
        <option value="0">Defect</option>
      </select>
    </label>
  );
  return (
    <section className="panel checkpanel">
      <h2>Fast extinguisher check</h2>
      <label>
        Scan/select extinguisher
        <select
          onChange={(e) =>
            void loadHistory(items.find((x) => x.id === Number(e.target.value)))
          }
        >
          <option value="">Select extinguisher…</option>
          {items.map((x) => (
            <option key={x.id} value={x.id}>
              {x.barcode} — {x.type} — {x.location_name}
            </option>
          ))}
        </select>
      </label>
      {item && (
        <>
          <form className="gridform" onSubmit={save}>
            <label>
              Check date
              <input
                name="check_date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label>
              Overall result
              <select name="result">
                <option>Pass</option>
                <option>Fail</option>
              </select>
            </label>
            <label>
              Pressure / condition
              <input name="pressure_condition" />
            </label>
            {yesNo("pin_seal_ok", "Safety pin / tamper seal")}
            {yesNo("hose_ok", "Hose / nozzle")}
            {yesNo("signage_present", "Signage")}
            {yesNo("positioned_ok", "Position / mounting")}
            {yesNo("accessible", "Accessible / unobstructed")}
            <label>
              Damage / corrosion
              <textarea name="damage_corrosion" />
            </label>
            <label>
              Notes
              <textarea name="notes" />
            </label>
            <label>
              Evidence photograph
              <input
                name="photo"
                type="file"
                accept="image/*"
                capture="environment"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button>Save immutable check</button>
          </form>
          <div className="history">
            <h3>Check history</h3>
            {history.map((check) => (
              <p key={check.id}>
                <b className={check.result === "Fail" ? "bad" : ""}>
                  {check.result}
                </b>{" "}
                · {check.check_date} · {check.notes || "No notes"}
              </p>
            ))}
          </div>
        </>
      )}
    </section>
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
              <option key={a.id} value={a.id}>
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
    "Full risk assessment",
    "Fire-safety assessments",
    "Outstanding risk-assessment actions",
    "High-risk unresolved findings",
    "Assessments due for review",
    "Assessments requiring site verification",
    "Assessment version history",
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
function Settings({ boot, user }: { boot: Boot | null; user: User }) {
  const venueId = boot?.venues[0]?.id;
  const [data, setData] = useState<any>();
  const load = () =>
    venueId && api(`/settings/master-data?venue_id=${venueId}`).then(setData);
  useEffect(() => {
    if (user.role === "administrator") void load();
  }, [venueId, user.role]);
  if (user.role !== "administrator")
    return (
      <Page title="Settings" subtitle="Administrator access required">
        <section className="panel">
          Master data is restricted to administrators.
        </section>
      </Page>
    );
  return (
    <Page
      title="Settings"
      subtitle="Venue master data and operational configuration"
    >
      <section className="panel">
        <h2>Fire-alarm rotation</h2>
        <form
          onSubmit={async (event: any) => {
            event.preventDefault();
            const value = Number(new FormData(event.currentTarget).get("days"));
            await api(`/settings/venues/${venueId}`, {
              method: "PUT",
              body: JSON.stringify({ call_point_warning_days: value }),
            });
            await load();
          }}
        >
          <label>
            Warn when an active call point has not been tested for this many
            days
            <input
              name="days"
              type="number"
              min="1"
              max="365"
              defaultValue={data?.settings.call_point_warning_days || 28}
            />
          </label>
          <button>Save interval</button>
        </form>
      </section>
      <section className="panel">
        <h2>Document types</h2>
        <form
          className="inlineform"
          onSubmit={async (event: any) => {
            event.preventDefault();
            const form = event.currentTarget;
            await api("/document-types", {
              method: "POST",
              body: JSON.stringify({
                venue_id: venueId,
                name: new FormData(form).get("name"),
                active: 1,
              }),
            });
            form.reset();
            await load();
          }}
        >
          <label>
            New document type
            <input name="name" required />
          </label>
          <button>Add</button>
        </form>
        <div className="list">
          {data?.documentTypes.map((item: any) => (
            <span key={item.id}>
              {item.name}{" "}
              <button
                className="link"
                onClick={async () => {
                  await api(`/document-types/${item.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ active: item.active ? 0 : 1 }),
                  });
                  await load();
                }}
              >
                {item.active ? "Deactivate" : "Activate"}
              </button>
            </span>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Locations</h2>
        <form
          className="inlineform"
          onSubmit={async (event: any) => {
            event.preventDefault();
            const form = event.currentTarget;
            await api("/locations", {
              method: "POST",
              body: JSON.stringify({
                venue_id: venueId,
                name: new FormData(form).get("name"),
                active: 1,
              }),
            });
            form.reset();
            await load();
          }}
        >
          <label>
            New location
            <input name="name" required />
          </label>
          <button>Add</button>
        </form>
        <div className="list">
          {data?.locations.map((location: any) => (
            <span key={location.id}>
              {location.name}{" "}
              <button
                className="link"
                onClick={async () => {
                  await api(`/locations/${location.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ active: location.active ? 0 : 1 }),
                  });
                  await load();
                }}
              >
                {location.active ? "Deactivate" : "Activate"}
              </button>
            </span>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Security configuration</h2>
        <p>
          Database, private object storage, JWT signing and CORS remain
          environment-backed. Roles and venue authorization are enforced on
          every request.
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
