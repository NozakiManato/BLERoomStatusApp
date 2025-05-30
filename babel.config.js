module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    Plugins: [
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@/components": "./components",
            "@/hooks": "./hooks",
            "@/services": "./services",
            "@/types": "./types",
            "@/utils": "./utils",
            "@/constants": "./constants",
          },
        },
      ],
    ],
  };
};
