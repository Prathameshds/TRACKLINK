import { ClickData, LinkData, DashboardStats } from "../types";
import { MousePointerClick, Globe2, Link, Smartphone, Laptop, Tablet, AlertCircle } from "lucide-react";

interface StatsGridProps {
  stats: DashboardStats;
  links: LinkData[];
  clicks: ClickData[];
}

export default function StatsGrid({ stats, links, clicks }: StatsGridProps) {
  // Compute Top listings
  const topCountries = Object.entries(stats.countries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const topDevices = Object.entries(stats.devices)
    .sort((a, b) => b[1] - a[1]);

  const topBrowsers = Object.entries(stats.browsers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const topReferrers = Object.entries(stats.referers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Return helper icon for device type
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType.toLowerCase()) {
      case "mobile":
        return <Smartphone className="w-4 h-4 text-[#4a9eff]" />;
      case "tablet":
        return <Tablet className="w-4 h-4 text-[#10b981]" />;
      default:
        return <Laptop className="w-4 h-4 text-purple-400" />;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
      {/* Total Clicks */}
      <div className="bg-[#16213e] border border-[#2a2a4a] rounded-xl p-5 relative overflow-hidden flex flex-col justify-between shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Total Click Logs</p>
            <h3 className="text-3xl font-bold font-display text-white mt-1 select-all">{stats.totalClicks}</h3>
          </div>
          <div className="p-3 rounded-lg bg-[#4a9eff]/10 border border-[#4a9eff]/20">
            <MousePointerClick className="w-5 h-5 text-[#4a9eff]" />
          </div>
        </div>
        <div className="mt-4 text-[11px] text-gray-400 border-t border-[#2a2a4a] pt-3">
          {clicks.length > 0 ? (
            <span>Last click registered at {new Date(clicks[0].timestamp).toLocaleTimeString()}</span>
          ) : (
            <span>Awaiting first tracked visitor...</span>
          )}
        </div>
      </div>

      {/* Unique IPs */}
      <div className="bg-[#16213e] border border-[#2a2a4a] rounded-xl p-5 relative overflow-hidden flex flex-col justify-between shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Unique Client IPs</p>
            <h3 className="text-3xl font-bold font-display text-white mt-1 select-all">{stats.uniqueIPs}</h3>
          </div>
          <div className="p-3 rounded-lg bg-[#10b981]/10 border border-[#10b981]/20">
            <Globe2 className="w-5 h-5 text-[#10b981]" />
          </div>
        </div>
        <div className="mt-4 text-[11px] text-gray-400 border-t border-[#2a2a4a] pt-3">
          <span>{stats.totalClicks > 0 ? `${Math.round((stats.uniqueIPs / stats.totalClicks) * 100)}% unique connection rate` : "No connections registered yet"}</span>
        </div>
      </div>

      {/* Active Short URLs */}
      <div className="bg-[#16213e] border border-[#2a2a4a] rounded-xl p-5 relative overflow-hidden flex flex-col justify-between shadow-md">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Active Click Trackers</p>
            <h3 className="text-3xl font-bold font-display text-white mt-1 select-all">{links.length}</h3>
          </div>
          <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <Link className="w-5 h-5 text-purple-400" />
          </div>
        </div>
        <div className="mt-4 text-[11px] text-gray-400 border-t border-[#2a2a4a] pt-3 flex items-center gap-1">
          <span>{links.length > 0 ? "Generate additional track links anytime" : "No tracking redirect links defined"}</span>
        </div>
      </div>

      {/* Distribution stats (devices/countries combo) */}
      <div className="bg-[#16213e] border border-[#2a2a4a] rounded-xl p-4 shadow-md col-span-1 md:col-span-3 lg:col-span-1">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2.5">Visitor Breakdown</h4>
        {stats.totalClicks === 0 ? (
          <div className="h-24 flex flex-col items-center justify-center text-center text-xs text-gray-500 gap-1.5 border border-dashed border-[#2a2a4a] rounded-lg">
            <AlertCircle className="w-4 h-4 text-gray-500" />
            <span>Aggregate breakdown graphs will spawn here</span>
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            {/* Top Device */}
            <div className="flex justify-between items-center bg-[#0f0f1a] py-1.5 px-2 rounded-md border border-[#2a2a4a]/40">
              <span className="text-gray-400 flex items-center gap-1.5">
                {topDevices[0] ? getDeviceIcon(topDevices[0][0]) : null}
                <span>Top Device:</span>
              </span>
              <span className="font-semibold text-white capitalize">{topDevices[0] ? `${topDevices[0][0]} (${Math.round((topDevices[0][1] / stats.totalClicks) * 100)}%)` : "N/A"}</span>
            </div>

            {/* Top Country */}
            <div className="flex justify-between items-center bg-[#0f0f1a] py-1.5 px-2 rounded-md border border-[#2a2a4a]/40">
              <span className="text-gray-400 flex items-center gap-1.5">
                <Globe2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Top Country:</span>
              </span>
              <span className="font-semibold text-white uppercase">{topCountries[0] ? `${topCountries[0][0]} (${topCountries[0][1]} clicks)` : "N/A"}</span>
            </div>

            {/* Top Web browser */}
            <div className="flex justify-between items-center bg-[#0f0f1a] py-1.5 px-2 rounded-md border border-[#2a2a4a]/40">
              <span className="text-gray-400 flex items-center gap-1.5">
                <Laptop className="w-3.5 h-3.5 text-yellow-400" />
                <span>Top Browser:</span>
              </span>
              <span className="font-semibold text-white capitalize">{topBrowsers[0] ? topBrowsers[0][0] : "N/A"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
