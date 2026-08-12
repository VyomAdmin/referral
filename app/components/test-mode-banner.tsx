export function TestModeBanner() {
  return (
    <div className="test-mode-banner" role="status">
      <strong>Test mode</strong>
      <span>No CRM writes, emails, or payments are sent.</span>
    </div>
  );
}
