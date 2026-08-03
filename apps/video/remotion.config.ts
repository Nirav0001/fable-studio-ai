// Remotion CLI configuration — Fable Studio AI video workspace.
// Renders 1080x1920 vertical Shorts as h264/yuv420p MP4s, matching the
// output contract of the ffmpeg fallback pipeline in apps/api.
import { Config } from "@remotion/cli/config";

Config.setEntryPoint("./src/index.ts");
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setCodec("h264");
Config.setPixelFormat("yuv420p");
