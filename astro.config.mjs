// @ts-check
import { defineConfig } from 'astro/config';
import aws from "astro-sst";

// https://astro.build/config
export default defineConfig({
  // server モード: デフォルトはSSR、静的生成したいページで `export const prerender = true;` を追加
  output: "server",
  adapter: aws()
});
