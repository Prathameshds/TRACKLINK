import { useEffect, useRef } from "react";
import * as LeafletModule from "leaflet";
import { ClickData } from "../types";
import { formatGeoPoint, hasValidCoordinates, parseCoordinate } from "../utils/geo";

// Safe resolve Leaflet module defaults due to ESM/CJS bundler differences
const L = (LeafletModule as any).default || LeafletModule;

interface LiveMapProps {
  clicks: ClickData[];
  selectedClick: ClickData | null;
  onSelectClick: (click: ClickData) => void;
}

export default function LiveMap({ clicks, selectedClick, onSelectClick }: LiveMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const markersMapRef = useRef<Map<number, L.CircleMarker>>(new Map());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAllTimers = () => {
    timersRef.current.forEach((timerId) => clearTimeout(timerId));
    timersRef.current = [];
  };

  const scheduleTimer = (callback: () => void, delay: number) => {
    const timerId = setTimeout(callback, delay);
    timersRef.current.push(timerId);
    return timerId;
  };

  // Set up the Leaflet Map once
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    // Prevent "Map container is already initialized" on StrictMode remounts
    if ((container as HTMLElement & { _leaflet_id?: number })._leaflet_id) {
      return;
    }
    if (mapRef.current) return;

    const map = L.map(container, {
      center: [20, 0],
      zoom: 2,
      minZoom: 1.5,
      zoomControl: false,
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = layerGroup;

    scheduleTimer(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 300);

    return () => {
      clearAllTimers();
      layerGroupRef.current = null;
      markersMapRef.current.clear();

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update markers whenever click registers change
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    markersMapRef.current.clear();

    clicks.forEach((click) => {
      if (!hasValidCoordinates(click.latitude, click.longitude)) return;

      const lat = parseCoordinate(click.latitude)!;
      const lon = parseCoordinate(click.longitude)!;

      const isLatest = clicks.length > 0 && clicks[0].id === click.id;

      const marker = L.circleMarker([lat, lon], {
        radius: isLatest ? 9 : 6.5,
        fillColor: isLatest ? "#10b981" : "#4a9eff",
        color: isLatest ? "#e2fbf0" : "#ffffff",
        weight: isLatest ? 2 : 1,
        opacity: 1,
        fillOpacity: 0.85,
      });

      const popupContent = `
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; min-width: 200px;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #2a2a4a; padding-bottom: 6px; margin-bottom: 6px;">
            <span style="font-weight: 700; color: #4a9eff;">IP: ${click.ip}</span>
            <span style="background: rgba(74, 158, 255, 0.2); color: #4a9eff; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">#${click.short_code}</span>
          </div>
          <div><strong>Geo Point:</strong> ${formatGeoPoint(click.city, click.region, click.country)}</div>
          <div><strong>Coordinates:</strong> ${lat.toFixed(5)}, ${lon.toFixed(5)}</div>
          <div><strong>Date Logged:</strong> ${new Date(click.timestamp).toLocaleTimeString()}</div>
          <div><strong>Device / OS:</strong> ${click.device_type} (${click.os})</div>
          <div><strong>Agent:</strong> <span style="color: #9cb3af; font-size: 11px;">${click.browser}</span></div>
          <div style="margin-top: 6px; font-size: 11px; color: #9ca3af; word-break: break-all; border-top: 1px solid #2a2a4a; padding-top: 6px;">
            Url: <a href="${click.target_url}" target="_blank" style="color: #4a9eff; text-decoration: underline;">${click.target_url}</a>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent);

      marker.on("click", () => {
        onSelectClick(click);
      });

      marker.addTo(layerGroup);
      markersMapRef.current.set(click.id, marker);
    });
  }, [clicks, onSelectClick]);

  // Listen to selectedClick changes to zoom and open corresponding popup
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedClick) return;

    const lat = parseCoordinate(selectedClick.latitude);
    const lon = parseCoordinate(selectedClick.longitude);
    if (lat === null || lon === null) return;

    map.flyTo([lat, lon], 5, {
      animate: true,
      duration: 1.2,
    });

    const marker = markersMapRef.current.get(selectedClick.id);
    const popupTimer = scheduleTimer(() => {
      if (!mapRef.current || !marker) return;
      try {
        marker.openPopup();
      } catch (popupErr) {
        console.warn("[LiveMap] Failed to open popup after flyTo", popupErr);
      }
    }, 1000);

    return () => {
      clearTimeout(popupTimer);
      timersRef.current = timersRef.current.filter((id) => id !== popupTimer);
    };
  }, [selectedClick]);

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-xl overflow-hidden border border-[#2a2a4a]" id="live-map-container">
      <div ref={mapContainerRef} className="w-full h-full" style={{ outline: "none" }} />

      <div className="absolute top-4 left-4 z-[400] bg-[#16213e]/90 backdrop-blur-md border border-[#2a2a4a] px-3 py-2 rounded-lg text-xs font-medium space-y-1 shadow-lg pointer-events-none">
        <div className="text-[#a1a1aa] uppercase tracking-wider text-[9px] font-bold">Map Legend</div>
        <div className="flex items-center space-x-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-300/30" />
          <span className="text-emerald-400">Latest Click Record</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />
          <span className="text-blue-400">Historical Visitor Click</span>
        </div>
      </div>
    </div>
  );
}
