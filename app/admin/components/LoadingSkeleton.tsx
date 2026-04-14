export default function LoadingSkeleton() {
  return (
    <div className="skel-list">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="skel-fine-row">
          <div className="skel-fine-left">
            <div className="skel-block skel-name" />
            <div className="skel-block skel-type" />
            <div className="skel-block skel-desc" />
            <div className="skel-block skel-meta" />
          </div>
          <div className="skel-fine-right">
            <div className="skel-block skel-amount" />
            <div className="skel-block skel-badge" />
          </div>
        </div>
      ))}
    </div>
  );
}
