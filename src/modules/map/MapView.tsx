"use client";

// Leaflet + OpenStreetMap tiles (free, no API key). Pins are colored circles;
// numbered pins are used for the day's route.
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Map as LMap } from "leaflet";

export type Pin = { id: string; lat: number; lng: number; color: string; title: string; sub?: string; href: string; n?: number };

export default function MapView({
  pins,
  route,
  center,
  className = "h-[60dvh] md:h-[70dvh]",
}: {
  pins: Pin[];
  route?: [number, number][];
  center: { lat: number; lng: number; zoom: number };
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], center.zoom);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap",
        }).addTo(map.current);
      }
      const m = map.current;
      m.eachLayer((layer) => {
        if (!(layer instanceof L.TileLayer)) m.removeLayer(layer);
      });
      const bounds: [number, number][] = [];
      for (const p of pins) {
        const size = p.n ? 26 : 16;
        const icon = L.divIcon({
          className: "",
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${p.color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);color:#fff;font:700 12px/22px system-ui;text-align:center">${p.n ?? ""}</div>`,
        });
        const marker = L.marker([p.lat, p.lng], { icon, title: p.title }).addTo(m);
        const div = document.createElement("div");
        const t = document.createElement("a");
        t.href = p.href;
        t.textContent = p.title;
        t.style.cssText = "font-weight:600;color:var(--brand)";
        t.onclick = (e) => {
          e.preventDefault();
          router.push(p.href);
        };
        div.appendChild(t);
        if (p.sub) {
          const s = document.createElement("div");
          s.textContent = p.sub;
          s.style.cssText = "font-size:12px;color:#5b6672;margin-top:2px";
          div.appendChild(s);
        }
        marker.bindPopup(div);
        bounds.push([p.lat, p.lng]);
      }
      if (route && route.length > 1) L.polyline(route, { color: "#0e7c86", weight: 4, opacity: 0.8, dashArray: "6 8" }).addTo(m);
      if (bounds.length > 1) m.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
      else if (bounds.length === 1) m.setView(bounds[0], 13);
    })();
    return () => {
      cancelled = true;
    };
  }, [pins, route, center, router]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    [],
  );

  return <div ref={el} className={`w-full overflow-hidden rounded-xl border border-border ${className}`} />;
}
