import { useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { ClickData, LinkData, DashboardStats } from "./types";
import LiveMap from "./components/LiveMap";
import StatsGrid from "./components/StatsGrid";
import ClickFeed from "./components/ClickFeed";
import LinkCreator from "./components/LinkCreator";
import { Activity, ShieldAlert, Wifi, WifiOff, Map, Link, Database, Trash2, HelpCircle } from "lucide-react";

export default function App() {
  const [clicks, setClicks] = useState<ClickData[]>([]);
  const [links, setLinks] = useState<LinkData[]>([]);
  const [selectedClick, setSelectedClick] = useState<ClickData | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "links">("dashboard");
  const [socketStatus, setSocketStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [systemAlert, setSystemAlert] = useState<string | null>(null);

  // Derive Statistics dynamically
  const [stats, setStats] = useState<DashboardStats>({
    totalClicks: 0,
    uniqueIPs: 0,
    countries: {},
    devices: {},
    browsers: {},
    referers: {},
  });

  // Calculate stats whenever click lists are modified
  useEffect(() => {
    const uniqueIpsList = new Set(clicks.map((c) => c.ip));
    const countriesCount: Record<string, number> = {};
    const devicesCount: Record<string, number> = {};
    const browsersCount: Record<string, number> = {};
    const referersCount: Record<string, number> = {};

    clicks.forEach((c) => {
      countriesCount[c.country] = (countriesCount[c.country] || 0) + 1;
      devicesCount[c.device_type] = (devicesCount[c.device_type] || 0) + 1;
      browsersCount[c.browser] = (browsersCount[c.browser] || 0) + 1;

      let refDomain = "Direct / Bookmark";
      if (c.referer && c.referer !== "Direct") {
        try {
          const urlObj = new URL(c.referer);
          refDomain = urlObj.hostname;
        } catch (e) {
          refDomain = c.referer;
        }
      }
      referersCount[refDomain] = (referersCount[refDomain] || 0) + 1;
    });

    setStats({
      totalClicks: clicks.length,
      uniqueIPs: uniqueIpsList.size,
      countries: countriesCount,
      devices: devicesCount,
      browsers: browsersCount,
      referers: referersCount,
    });
  }, [clicks]);

  // Establish real-time connection on mount
  useEffect(() => {
    // Empty arguments tells socket.io-client to connect back to the origin server serving this app!
    const socket: Socket = io();

    socket.on("connect", () => {
      setSocketStatus("connected");
      console.log("WebSocket dashboard uplink established successfully.");
    });

    socket.on("disconnect", () => {
      setSocketStatus("disconnected");
    });

    socket.on("connect_error", () => {
      setSocketStatus("disconnected");
    });

    // Initial Full State Sync from server
    socket.on("initial_sync", (data: { clicks: ClickData[]; links: any[] }) => {
      // Server stores map/list - let's align names
      const sanitisedLinks: LinkData[] = data.links.map((lnk) => ({
        short_code: lnk.short_code,
        target_url: lnk.target_url,
        created_at: lnk.created_at,
        clicks: lnk.clicksCount !== undefined ? lnk.clicksCount : lnk.clicks, // handle naming safely
      }));

      // Sort clicks newest first
      const sortedClicks = [...data.clicks].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setClicks(sortedClicks);
      setLinks(sanitisedLinks);

      if (sortedClicks.length > 0) {
        setSelectedClick(sortedClicks[0]);
      }
    });

    // Single Click real-time event listener
    socket.on("new_click", (newClick: ClickData) => {
      setClicks((prev) => {
        // Guard against duplicate reads if we're also fetching
        if (prev.some((c) => c.id === newClick.id)) return prev;
        const updated = [newClick, ...prev];
        return updated;
      });

      // Update click counters in the links table smoothly
      setLinks((prev) =>
        prev.map((lnk) => {
          if (lnk.short_code === newClick.short_code) {
            return {
              ...lnk,
              clicks: lnk.clicks + 1,
            };
          }
          return lnk;
        })
      );

      // Sonar pop notification — gracefully handles suspended AudioContext and permission blocks
      void (async () => {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (!AudioContextClass) return;

          const audioCtx = new AudioContextClass();
          try {
            if (audioCtx.state === "suspended") {
              await audioCtx.resume().catch(() => {});
            }
            if (audioCtx.state !== "running") {
              await audioCtx.close().catch(() => {});
              return;
            }

            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = "sine";
            osc.frequency.setValueAtTime(650, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.01, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.15);

            setTimeout(() => {
              audioCtx.close().catch(() => {});
            }, 300);
          } catch (playErr) {
            audioCtx.close().catch(() => {});
          }
        } catch {
          // Autoplay policy or iframe restriction — silent fallback
        }
      })();

      // Open new click in focused screen context
      setSelectedClick(newClick);

      // Flash fleeting visual notification banner
      setSystemAlert(`New click trace detected from IP: ${newClick.ip} (${newClick.city}, ${newClick.country})!`);
      setTimeout(() => setSystemAlert(null), 5000);
    });

    // High precision info update listener
    socket.on("click_updated", (updatedClick: ClickData) => {
      setClicks((prev) => {
        return prev.map((click) => {
          if (click.id === updatedClick.id) {
            return updatedClick;
          }
          return click;
        });
      });
      setSelectedClick((prevSelected) => {
        if (prevSelected && prevSelected?.id === updatedClick.id) {
          return updatedClick;
        }
        return prevSelected;
      });
      setSystemAlert(`Location pinpointed precisely for visitor from IP: ${updatedClick.ip}!`);
      setTimeout(() => setSystemAlert(null), 4000);
    });

    // Reset listener
    socket.on("reset_stats", () => {
      setClicks([]);
      setLinks([]);
      setSelectedClick(null);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Creation of dynamic tracking link
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const handleCreateLink = async (targetUrl: string): Promise<boolean> => {
    setIsCreatingLink(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ targetUrl }),
      });

      if (res.ok) {
        const data = await res.json();
        const newLink: LinkData = {
          short_code: data.short_code,
          target_url: data.target_url,
          created_at: data.created_at,
          clicks: data.clicksCount !== undefined ? data.clicksCount : data.clicks,
        };

        setLinks((prev) => [newLink, ...prev]);
        setIsCreatingLink(false);
        return true;
      } else {
        const errData = await res.json();
        setErrorMessage(errData.error || "Failed to generate tracking address.");
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Error contacting the tracking backend server.");
    }
    setIsCreatingLink(false);
    return false;
  };

  // Full clear/re-initialize of mock log tracker db
  const handleSystemReset = () => {
    setConfirmModal({
      isOpen: true,
      title: "Confirm Master Reset",
      message: "Are you absolutely sure you want to delete all active tracking redirect links and clear historical click aggregates? This cannot be undone.",
      onConfirm: async () => {
        try {
          const res = await fetch("/api/reset", { method: "POST" });
          if (res.ok) {
            setClicks([]);
            setLinks([]);
            setSelectedClick(null);
          }
        } catch (e) {
          console.error(e);
          setErrorMessage("Failed to clear data coordinates.");
        }
        setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleSelectClick = useCallback((click: ClickData) => {
    setSelectedClick(click);
  }, []);

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-[#f3f4f6]">
      {/* Dynamic Floating Notification Box for Live Socket Triggering */}
      {systemAlert && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] bg-emerald-500 text-emerald-950 font-bold text-xs select-all px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-2 border border-emerald-300/30 animate-bounce">
          <Activity className="w-4 h-4 animate-pulse" />
          <span>{systemAlert}</span>
        </div>
      )}

      {/* Floating Custom Error Banner */}
      {errorMessage && (
        <div className="fixed top-5 right-5 z-[9999] max-w-sm bg-rose-500 text-white font-semibold text-xs px-4 py-3.5 rounded-xl shadow-2xl flex items-center justify-between border border-rose-400/30">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 text-white animate-pulse" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="ml-4 hover:bg-white/20 p-1 rounded transition-colors text-white text-[14px]"
          >
            &times;
          </button>
        </div>
      )}

      {/* Custom Confirmation Modal Overlay (bypasses native alert context block) */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#16213e] border border-rose-500/30 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
              <h3 className="font-bold text-lg font-display text-white">{confirmModal.title}</h3>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">{confirmModal.message}</p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 text-xs font-semibold rounded-lg transition-colors"
              >
                No, cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors shadow-lg shadow-rose-900/30"
              >
                Yes, reset system
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Header navigation */}
      <header className="border-b border-[#2a2a4a] bg-[#16213e]/60 sticky top-0 backdrop-blur-md z-[500]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="p-2 bg-[#4a9eff]/10 rounded-lg border border-[#4a9eff]/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-[#4a9eff]" />
            </span>
            <div>
              <h1 className="text-lg font-bold font-display tracking-tight text-white flex items-center gap-2">
                URL redirector <span className="text-xs bg-[#4a9eff]/15 text-[#4a9eff] px-2 py-0.5 rounded border border-[#4a9eff]/20 uppercase">Uplink Log</span>
              </h1>
              <p className="text-[10px] text-gray-400 font-mono hidden sm:block">Live Geolocation and IP analytics suite</p>
            </div>
          </div>

          {/* Setup Heartbeat & reset button */}
          <div className="flex items-center space-x-3">
            {/* Realtime WebSocket Heartbeat indicator */}
            <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-[#2a2a4a] text-xs font-mono">
              {socketStatus === "connected" ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold uppercase text-[10px]">UPLINK ACTIVE</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-yellow-500 animate-pulse" />
                  <span className="text-yellow-500 font-semibold uppercase text-[10px]">RECONNECTING</span>
                </>
              )}
            </div>

            {/* Clear Database trigger */}
            {links.length > 0 && (
              <button
                onClick={handleSystemReset}
                className="p-2 border border-rose-500/10 hover:border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/15 text-rose-400 rounded-lg transition-all"
                title="Flush and reset database logs"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <StatsGrid stats={stats} links={links} clicks={clicks} />

        {/* Tab Selection */}
        <div className="flex border-b border-[#2a2a4a] mb-6 gap-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === "dashboard"
                ? "border-[#4a9eff] text-white bg-[#4a9eff]/5"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            <Map className="w-4 h-4" />
            Live Map & Click Feeds
          </button>
          <button
            onClick={() => setActiveTab("links")}
            className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === "links"
                ? "border-[#4a9eff] text-white bg-[#4a9eff]/5"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            <Link className="w-4 h-4" />
            URL redirect Config ({links.length})
          </button>
        </div>

        {/* Tab Viewport components render */}
        {activeTab === "dashboard" ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            {/* Left side / Top Leaflet map visualization takes 2cols span */}
            <div className="lg:col-span-2 flex flex-col h-[500px] lg:h-[550px]">
              <LiveMap
                clicks={clicks}
                selectedClick={selectedClick}
                onSelectClick={handleSelectClick}
              />
            </div>

            {/* Right side / Bottom scroll list of cards takes 1 col */}
            <div className="lg:col-span-1 flex flex-col h-[500px] lg:h-[550px]">
              <ClickFeed
                clicks={clicks}
                selectedClick={selectedClick}
                onSelectClick={handleSelectClick}
              />
            </div>
          </div>
        ) : (
          <LinkCreator
            links={links}
            onCreateLink={handleCreateLink}
            onClearAll={handleSystemReset}
            isCreating={isCreatingLink}
          />
        )}
        
      </main>
    </div>
  );
}
