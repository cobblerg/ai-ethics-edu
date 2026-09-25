import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // 상위 폴더(C:\Users\cobbl)에 있는 무관한 package-lock.json 때문에
  // Turbopack이 워크스페이스 루트를 잘못 추론하는 것을 방지한다.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
