import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { ok, handler } from "../../lib/respond";
import { notFound } from "../../lib/errors";
import { fnv1a, safeJson, seededRandom } from "@fable/shared";
import type {
  AnalyticsOverviewT,
  ChannelSummary,
  ChannelType,
  HeatmapCell,
  JobSummary,
  SlotStatus,
  UpcomingSlot,
  VideoStatus,
  VideoSummary,
} from "@fable/shared";

const router = Router();

function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toVideoSummary(v: {
  id: string;
  channelId: string;
  title: string;
  status: string;
  viralScore: number;
  durationSec: number;
  thumbnailPath: string | null;
  youtubeId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  channel?: { name: string };
  stats?: { views: number }[];
}): VideoSummary {
  return {
    id: v.id,
    channelId: v.channelId,
    channelName: v.channel?.name,
    title: v.title,
    status: v.status as VideoStatus,
    viralScore: v.viralScore,
    durationSec: v.durationSec,
    thumbnailPath: v.thumbnailPath,
    youtubeId: v.youtubeId,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    views: v.stats?.reduce((s, r) => s + r.views, 0),
    createdAt: v.createdAt.toISOString(),
  };
}

/** GET /analytics/overview — the dashboard payload. */
router.get(
  "/overview",
  handler(async (req, res) => {
    const userId = req.user!.id;
    const channels = await prisma.channel.findMany({ where: { userId } });
    const channelIds = channels.map((c) => c.id);

    // Latest snapshot date = "today" in the demo dataset.
    const latest = await prisma.analyticsSnapshot.findFirst({
      where: { channelId: { in: channelIds } },
      orderBy: { date: "desc" },
    });
    const today = latest ? dayStart(latest.date) : dayStart(new Date());
    const since = new Date(today);
    since.setDate(since.getDate() - 14);

    const snapshots = await prisma.analyticsSnapshot.findMany({
      where: { channelId: { in: channelIds }, date: { gte: since } },
      orderBy: { date: "asc" },
    });

    // Group by day across channels.
    const byDay = new Map<
      string,
      { views: number; watch: number; subs: number; rev: number; ctr: number[]; avg: number[]; ret: number[]; uploads: number }
    >();
    for (const s of snapshots) {
      const key = dayStart(s.date).toISOString();
      const row = byDay.get(key) ?? { views: 0, watch: 0, subs: 0, rev: 0, ctr: [], avg: [], ret: [], uploads: 0 };
      row.views += s.views;
      row.watch += s.watchMinutes;
      row.subs += s.subsGained;
      row.rev += s.revenueGbp;
      row.ctr.push(s.ctr);
      row.avg.push(s.avgViewSec);
      row.ret.push(s.retention);
      row.uploads += s.uploads;
      byDay.set(key, row);
    }
    const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const cur = days[days.length - 1];
    const prev = days[days.length - 2];
    const pctDelta = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : 0);

    const [uploadedToday, scheduledCount] = await Promise.all([
      prisma.video.count({
        where: { channelId: { in: channelIds }, status: "published", publishedAt: { gte: today } },
      }),
      prisma.scheduleSlot.count({
        where: { channelId: { in: channelIds }, status: "scheduled", scheduledAt: { gte: new Date() } },
      }),
    ]);

    const latestUploads = await prisma.video.findMany({
      where: { channelId: { in: channelIds }, status: "published" },
      orderBy: { publishedAt: "desc" },
      take: 6,
      include: { channel: { select: { name: true } }, stats: { select: { views: true } } },
    });

    const upcoming = await prisma.scheduleSlot.findMany({
      where: { channelId: { in: channelIds }, scheduledAt: { gte: new Date() }, status: { in: ["scheduled", "queued"] } },
      orderBy: { scheduledAt: "asc" },
      take: 6,
      include: { video: { include: { channel: { select: { name: true } } } }, channel: { select: { name: true } } },
    });

    const jobs = await prisma.jobRecord.findMany({
      where: { userId, status: { in: ["queued", "active"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    const channelSummaries: ChannelSummary[] = await Promise.all(
      channels.map(async (c) => {
        const snap = await prisma.analyticsSnapshot.findFirst({
          where: { channelId: c.id },
          orderBy: { date: "desc" },
        });
        const ready = await prisma.video.count({ where: { channelId: c.id, status: "ready" } });
        return {
          id: c.id,
          name: c.name,
          handle: c.handle,
          type: c.type as ChannelType,
          avatarColor: c.avatarColor,
          connected: c.connected,
          subscriberCount: c.subscriberCount,
          viewsToday: snap?.views ?? 0,
          videosReady: ready,
        };
      }),
    );

    const overview: AnalyticsOverviewT = {
      today: {
        uploads: uploadedToday || (cur?.uploads ?? 0),
        scheduled: scheduledCount,
        views: cur?.views ?? 0,
        subsGained: cur?.subs ?? 0,
        revenueGbp: Math.round((cur?.rev ?? 0) * 100) / 100,
        ctr: Math.round(avg(cur?.ctr ?? []) * 10) / 10,
        avgViewSec: Math.round(avg(cur?.avg ?? []) * 10) / 10,
        retention: Math.round(avg(cur?.ret ?? []) * 10) / 10,
      },
      deltas: {
        uploads: pctDelta(cur?.uploads ?? 0, prev?.uploads ?? 0),
        views: pctDelta(cur?.views ?? 0, prev?.views ?? 0),
        subsGained: pctDelta(cur?.subs ?? 0, prev?.subs ?? 0),
        revenueGbp: pctDelta(cur?.rev ?? 0, prev?.rev ?? 0),
        ctr: pctDelta(avg(cur?.ctr ?? []), avg(prev?.ctr ?? [])),
        avgViewSec: pctDelta(avg(cur?.avg ?? []), avg(prev?.avg ?? [])),
        retention: pctDelta(avg(cur?.ret ?? []), avg(prev?.ret ?? [])),
      },
      sparklines: {
        views: days.map((d) => d.views),
        subsGained: days.map((d) => d.subs),
        revenueGbp: days.map((d) => Math.round(d.rev * 100) / 100),
        ctr: days.map((d) => Math.round(avg(d.ctr) * 10) / 10),
        avgViewSec: days.map((d) => Math.round(avg(d.avg) * 10) / 10),
        retention: days.map((d) => Math.round(avg(d.ret) * 10) / 10),
        uploads: days.map((d) => d.uploads),
      },
      latestUploads: latestUploads.map(toVideoSummary),
      upcomingUploads: upcoming.map(
        (s): UpcomingSlot => ({
          id: s.id,
          channelId: s.channelId,
          channelName: s.channel.name,
          scheduledAt: s.scheduledAt.toISOString(),
          status: s.status as SlotStatus,
          video: s.video ? toVideoSummary(s.video) : null,
        }),
      ),
      processingQueue: jobs.map(
        (j): JobSummary => ({
          id: j.id,
          queue: j.queue,
          name: j.name,
          refType: j.refType,
          refId: j.refId,
          status: j.status,
          progress: j.progress,
          message: j.message,
          createdAt: j.createdAt.toISOString(),
        }),
      ),
      channels: channelSummaries,
    };
    ok(res, overview);
  }),
);

/** GET /analytics/channels/:id?days=28 */
router.get(
  "/channels/:id",
  handler(async (req, res) => {
    const userId = req.user!.id;
    const days = Math.min(Number(req.query.days ?? 28) || 28, 90);
    const channel = await prisma.channel.findFirst({ where: { id: req.params.id, userId } });
    if (!channel) throw notFound("Channel");

    const snaps = await prisma.analyticsSnapshot.findMany({
      where: { channelId: channel.id },
      orderBy: { date: "desc" },
      take: days,
    });
    snaps.reverse();

    const series = snaps.map((s) => ({
      date: dayStart(s.date).toISOString().slice(0, 10),
      views: s.views,
      watchMinutes: s.watchMinutes,
      subsGained: s.subsGained,
      revenueGbp: Math.round(s.revenueGbp * 100) / 100,
      ctr: s.ctr,
      retention: s.retention,
    }));

    const totals = {
      views: series.reduce((a, s) => a + s.views, 0),
      watchMinutes: series.reduce((a, s) => a + s.watchMinutes, 0),
      subsGained: series.reduce((a, s) => a + s.subsGained, 0),
      revenueGbp: Math.round(series.reduce((a, s) => a + s.revenueGbp, 0) * 100) / 100,
      ctr: series.length ? Math.round((series.reduce((a, s) => a + s.ctr, 0) / series.length) * 10) / 10 : 0,
      retention: series.length
        ? Math.round((series.reduce((a, s) => a + s.retention, 0) / series.length) * 10) / 10
        : 0,
    };

    const published = await prisma.video.findMany({
      where: { channelId: channel.id, status: "published" },
      include: { stats: { select: { views: true, curveJson: true }, orderBy: { date: "desc" } } },
    });
    const withViews = published.map((v) => ({
      ...toVideoSummary(v),
      views: v.stats.reduce((a, s) => a + s.views, 0),
      retentionCurve: safeJson<{ pct: number; value: number }[]>(v.stats[0]?.curveJson, []),
    }));
    withViews.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));

    ok(res, {
      series,
      totals,
      bestVideos: withViews.slice(0, 5),
      worstVideos: withViews.slice(-5).reverse(),
    });
  }),
);

/** GET /analytics/heatmap?channelId — 7×24 relative-performance grid. */
router.get(
  "/heatmap",
  handler(async (req, res) => {
    const userId = req.user!.id;
    const channelId = typeof req.query.channelId === "string" ? req.query.channelId : undefined;
    const channels = await prisma.channel.findMany({
      where: { userId, ...(channelId ? { id: channelId } : {}) },
    });
    if (channels.length === 0) throw notFound("Channel");

    // Deterministic per-channel-set heatmap seeded from ids + real snapshot volume.
    const seedKey = channels.map((c) => c.id).join("|");
    const rand = seededRandom(fnv1a(seedKey));
    const totalViews = await prisma.analyticsSnapshot.aggregate({
      where: { channelId: { in: channels.map((c) => c.id) } },
      _sum: { views: true },
    });
    const scale = Math.min(1, (totalViews._sum.views ?? 0) / 1_000_000 + 0.55);

    const cells: HeatmapCell[] = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        // Audience curve: evenings strong, 6-8am weak, weekends lifted.
        const evening = Math.exp(-Math.pow(hour - 19, 2) / 18) * 55;
        const lunch = Math.exp(-Math.pow(hour - 12.5, 2) / 6) * 30;
        const morning = Math.exp(-Math.pow(hour - 8, 2) / 8) * 14;
        const weekend = day === 0 || day === 6 ? 14 : 0;
        const noise = rand() * 14;
        const value = Math.min(100, Math.round((evening + lunch + morning + weekend + noise) * scale));
        cells.push({ day, hour, value });
      }
    }
    ok(res, cells);
  }),
);

/** GET /analytics/growth?days=90 — cumulative subscribers + views across channels. */
router.get(
  "/growth",
  handler(async (req, res) => {
    const userId = req.user!.id;
    const days = Math.min(Number(req.query.days ?? 90) || 90, 180);
    const channels = await prisma.channel.findMany({ where: { userId } });
    const baseSubs = channels.reduce((a, c) => a + c.subscriberCount, 0);

    const snaps = await prisma.analyticsSnapshot.findMany({
      where: { channelId: { in: channels.map((c) => c.id) } },
      orderBy: { date: "asc" },
    });
    const byDay = new Map<string, { views: number; subs: number }>();
    for (const s of snaps) {
      const key = dayStart(s.date).toISOString().slice(0, 10);
      const row = byDay.get(key) ?? { views: 0, subs: 0 };
      row.views += s.views;
      row.subs += s.subsGained;
      byDay.set(key, row);
    }
    const sorted = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-days);
    const totalGained = sorted.reduce((a, [, v]) => a + v.subs, 0);
    let runningSubs = Math.max(0, baseSubs - totalGained);
    let runningViews = 0;
    const series = sorted.map(([date, v]) => {
      runningSubs += v.subs;
      runningViews += v.views;
      return { date, subscribers: runningSubs, views: runningViews };
    });
    ok(res, { series });
  }),
);

export default router;
