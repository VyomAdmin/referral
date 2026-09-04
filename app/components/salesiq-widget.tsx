"use client";

import { usePathname } from "next/navigation";

const ZOHO_SALESIQ_WIDGET_CODE = "siq8c388d06e267f6ca1720cfeebabf0b7ad65c1a54f91d01eaa81fd3ccb43d570a";
const ZOHO_SALESIQ_INIT_SCRIPT = `window.$zoho=window.$zoho || {};$zoho.salesiq=$zoho.salesiq||{ready:function(){}}`;

// Live chat is for public-facing referrer/customer pages only — the admin
// dashboard is an internal tool and shouldn't surface a customer support widget.
export function SalesIqWidget() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;

  return (
    <>
      <script id="zsiq-init" dangerouslySetInnerHTML={{ __html: ZOHO_SALESIQ_INIT_SCRIPT }} />
      <script id="zsiqscript" src={`https://salesiq.zohopublic.com/widget?wc=${ZOHO_SALESIQ_WIDGET_CODE}`} defer />
    </>
  );
}
