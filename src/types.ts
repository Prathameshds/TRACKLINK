/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ClickData {
  id: number;
  timestamp: string;
  ip: string;
  city: string;
  region: string;
  country: string;
  latitude: string;
  longitude: string;
  org: string;
  timezone: string;
  device_type: string;
  os: string;
  browser: string;
  user_agent: string;
  referer: string;
  target_url: string;
  short_code: string;
}

export interface LinkData {
  short_code: string;
  target_url: string;
  created_at: string;
  clicks: number;
}

export interface DashboardStats {
  totalClicks: number;
  uniqueIPs: number;
  countries: Record<string, number>;
  devices: Record<string, number>;
  browsers: Record<string, number>;
  referers: Record<string, number>;
}
