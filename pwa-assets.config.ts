import {
  createAppleSplashScreens,
  defineConfig,
  minimal2023Preset,
} from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    appleSplashScreens: createAppleSplashScreens(
      {
        padding: 0.3,
        resizeOptions: { background: "white", fit: "contain" },
        linkMediaOptions: {
          log: true,
          addMediaScreen: true,
          basePath: "/",
          xhtml: false,
        },
        png: {
          compressionLevel: 9,
          quality: 60,
        },
        name: (landscape, size, dark) => {
          return `apple-splash-${landscape ? "landscape" : "portrait"}-${typeof dark === "boolean" ? (dark ? "dark-" : "light-") : ""}${size.width}x${size.height}.png`;
        },
      },
      [
        "iPhone 12",
        "iPhone 12 Pro",
        "iPhone 12 Pro Max",
        "iPhone 13",
        "iPhone 13 Pro",
        "iPhone 13 Pro Max",
        "iPhone 14",
        "iPhone 14 Pro",
        "iPhone 14 Pro Max",
        "iPhone 15",
        "iPhone 15 Pro",
        "iPhone 15 Pro Max",
        "iPhone 16",
        "iPhone 16 Pro",
        "iPhone 16 Pro Max",
        'iPad Pro 9.7"',
        'iPad Pro 10.5"',
        'iPad Pro 11"',
        'iPad Pro 12.9"',
      ],
    ),
  },
  images: ["public/logo.svg"],
});
