import "./admin.css";
import LoadingSkeleton from "./components/LoadingSkeleton";

export default function AdminLoading() {
  return (
    <div className="adm-page">
      <header className="adm-header">
        <div className="adm-header-left">
          <div className="adm-gold-bar" />
          <div>
            <div className="adm-title">JP Admin</div>
            <div className="adm-subtitle">Acacia · Oregon State</div>
          </div>
        </div>
      </header>

      <div className="adm-body">
        <div className="adm-tabs">
          {["fines", "outstanding", "members", "soc pro", "audit", "sessions"].map((t) => (
            <div key={t} className="adm-tab">{t}</div>
          ))}
        </div>

        <div className="adm-card">
          <LoadingSkeleton />
        </div>
      </div>
    </div>
  );
}
