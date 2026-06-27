import { useEffect, useState } from "react";
import { ClickData } from "../types";
import { Smartphone, Laptop, Tablet, ExternalLink, Globe, MapPin, Loader2, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { formatCoordinates, formatGeoPoint } from "../utils/geo";

interface ClickFeedProps {
  clicks: ClickData[];
  selectedClick: ClickData | null;
  onSelectClick: (click: ClickData) => void;
}

export default function ClickFeed({ clicks, selectedClick, onSelectClick }: ClickFeedProps) {
  // We want to trigger state force re-renders occasionally to update "highlight" age calculation
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case "mobile":
        return <Smartphone className="w-3.5 h-3.5 text-[#4a9eff]" />;
      case "tablet":
        return <Tablet className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Laptop className="w-3.5 h-3.5 text-purple-400" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#16213e] border border-[#2a2a4a] rounded-xl overflow-hidden shadow-lg">
      <div className="px-4 py-3 border-b border-[#2a2a4a] bg-[#16213e] flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <h3 className="font-semibold text-sm text-gray-200">Live Visitor Click Stream</h3>
        </div>
        <span className="text-xs text-gray-400 bg-[#0f0f1a] px-2 py-0.5 rounded-full border border-[#2a2a4a]">
          {clicks.length} total
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-[500px] lg:max-h-[550px]">
        {clicks.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center text-gray-500 text-xs py-10 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#4a9eff]" />
            <span>Awaiting visitor traffic...</span>
            <span className="text-[10px] text-gray-600 max-w-[200px]">
              Generate a redirect URL below and open it of your own device to try!
            </span>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {clicks.map((click, index) => {
              const isSelected = selectedClick?.id === click.id;
              const ageInMs = Date.now() - new Date(click.timestamp).getTime();
              // Highlight is active if the click was added in the last 4 seconds
              const isNewHighlight = ageInMs < 4000;

              return (
                <motion.div
                  key={click.id}
                  initial={index === 0 ? { opacity: 0, y: -20, scale: 0.95 } : undefined}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.4 }}
                  onClick={() => onSelectClick(click)}
                  id={`click-card-${click.id}`}
                  className={`relative cursor-pointer transition-all duration-300 rounded-lg p-3.5 border text-xs text-left select-none ${
                    isNewHighlight
                      ? "bg-slate-900 border-[#10b981] shadow-[0_0_12px_rgba(16,185,129,0.15)] ring-1 ring-[#10b981]/50"
                      : isSelected
                      ? "bg-[#203056]/80 border-[#4a9eff] shadow-md scale-[1.01] ring-1 ring-[#4a9eff]/30"
                      : "bg-[#0f0f1a] hover:bg-[#1a1c2e] border-[#2a2a4a] hover:border-[#3b3b6a]"
                  }`}
                >
                  {/* Glowing Status dot for fresh elements */}
                  {isNewHighlight && (
                    <span className="absolute top-2 right-2 bg-emerald-500 text-emerald-950 font-bold text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded shadow">
                      NEW CLICK
                    </span>
                  )}

                  {/* Header IP Address */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white tracking-wide text-[13px]">{click.ip}</span>
                    <span className="text-gray-500 text-[10px] tabular-nums">
                      {new Date(click.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  </div>

                  {/* Geo point details */}
                  <div className="space-y-1 text-[#c9cbd0] mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#fe5f55]" />
                      <span className="font-semibold text-white">
                        {formatGeoPoint(click.city, click.region, click.country)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 pl-5 text-gray-400">
                      <Globe className="w-3 h-3 text-gray-500" />
                      <span>{formatCoordinates(click.latitude, click.longitude)}</span>
                    </div>
                  </div>

                  {/* Tech stack / Platform badges */}
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    <span className="inline-flex items-center gap-1 bg-[#203056] border border-[#2a2a4a] text-white px-2 py-0.5 rounded text-[10px]">
                      {getDeviceIcon(click.device_type)}
                      <span className="capitalize">{click.device_type}</span>
                    </span>
                    <span className="bg-[#1e1e30] text-gray-300 border border-gray-800 px-2 py-0.5 rounded text-[10px] font-mono">
                      {click.os}
                    </span>
                    <span className="bg-[#1e1e30] text-gray-300 border border-gray-800 px-2 py-0.5 rounded text-[10px] font-mono">
                      {click.browser}
                    </span>
                  </div>

                  {/* Target link redirections */}
                  <div className="border-t border-[#2a2a4a]/60 pt-2.5 mt-2 flex flex-col gap-1 text-[11px] text-gray-400">
                    <div className="flex items-center justify-between">
                      <span className="text-[#a1a1aa]">Trigger Source: <strong className="text-white">/t/{click.short_code}</strong></span>
                    </div>
                    <div className="flex items-center gap-1 text-[#4a9eff] hover:underline font-medium text-[10px] mt-0.5 break-all truncate">
                      <span>Redirected to:</span>
                      <ArrowRight className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{click.target_url}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
