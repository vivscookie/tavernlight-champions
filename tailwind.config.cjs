/** @type {import('tailwindcss').Config} */
module.exports = {
  "content": [
    "./src/**/*.{html,js}",
    "./build/**/*.js"
  ],
  "darkMode": "class",
  "theme": {
    "extend": {
      "colors": {
        "surface-container": "#211f1e",
        "on-secondary-fixed": "#241a00",
        "secondary": "#e9c349",
        "on-surface": "#e6e1df",
        "on-error": "#690005",
        "surface-container-high": "#2b2a28",
        "on-primary-fixed-variant": "#604100",
        "surface-tint": "#fabc4d",
        "on-primary-container": "#5e4000",
        "tertiary-fixed": "#ffddb1",
        "inverse-on-surface": "#32302f",
        "on-surface-variant": "#d4c4b0",
        "on-secondary-container": "#342800",
        "on-tertiary-fixed": "#291800",
        "error": "#ffb4ab",
        "surface-dim": "#141312",
        "inverse-surface": "#e6e1df",
        "secondary-container": "#af8d11",
        "background": "#141312",
        "primary-container": "#e5a93c",
        "on-tertiary-container": "#603f02",
        "error-container": "#93000a",
        "surface-bright": "#3b3937",
        "on-error-container": "#ffdad6",
        "surface-variant": "#363433",
        "tertiary": "#f8c780",
        "on-secondary-fixed-variant": "#574500",
        "secondary-fixed": "#ffe088",
        "primary-fixed": "#ffdead",
        "tertiary-fixed-dim": "#efbe78",
        "on-primary-fixed": "#281900",
        "secondary-fixed-dim": "#e9c349",
        "on-primary": "#432c00",
        "surface": "#141312",
        "on-tertiary": "#442b00",
        "inverse-primary": "#7e5700",
        "on-tertiary-fixed-variant": "#614003",
        "outline-variant": "#504535",
        "surface-container-low": "#1c1b1a",
        "on-background": "#e6e1df",
        "primary-fixed-dim": "#fabc4d",
        "tertiary-container": "#daac68",
        "primary": "#ffc665",
        "outline": "#9d8f7c",
        "surface-container-lowest": "#0f0e0d",
        "on-secondary": "#3c2f00",
        "surface-container-highest": "#363433"
      },
      "borderRadius": {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      "spacing": {
        "space-xl": "2.5rem",
        "gutter-mobile": "0.75rem",
        "space-md": "1rem",
        "margin": "2rem",
        "space-lg": "1.5rem",
        "space-sm": "0.5rem",
        "space-xs": "0.25rem",
        "margin-mobile": "1rem",
        "gutter": "1.25rem"
      },
      "fontFamily": {
        "headline-md": [
          "Newsreader"
        ],
        "headline-lg": [
          "Newsreader"
        ],
        "body-md": [
          "Space Grotesk"
        ],
        "display-hero": [
          "Newsreader"
        ],
        "label-caps": [
          "Space Grotesk"
        ],
        "title-ui": [
          "Space Grotesk"
        ],
        "headline-lg-mobile": [
          "Newsreader"
        ],
        "headline-sm": [
          "Newsreader"
        ],
        "stat-numeric": [
          "Space Grotesk"
        ],
        "body-lg": [
          "Space Grotesk"
        ],
        "display-hero-mobile": [
          "Newsreader"
        ],
        "body-sm": [
          "Space Grotesk"
        ]
      },
      "fontSize": {
        "headline-md": [
          "24px",
          {
            "lineHeight": "32px",
            "letterSpacing": "0.02em",
            "fontWeight": "600"
          }
        ],
        "headline-lg": [
          "36px",
          {
            "lineHeight": "44px",
            "letterSpacing": "-0.01em",
            "fontWeight": "600"
          }
        ],
        "body-md": [
          "14px",
          {
            "lineHeight": "20px",
            "fontWeight": "400"
          }
        ],
        "display-hero": [
          "56px",
          {
            "lineHeight": "64px",
            "letterSpacing": "-0.02em",
            "fontWeight": "700"
          }
        ],
        "label-caps": [
          "11px",
          {
            "lineHeight": "14px",
            "letterSpacing": "0.18em",
            "fontWeight": "600"
          }
        ],
        "title-ui": [
          "14px",
          {
            "lineHeight": "20px",
            "letterSpacing": "0.14em",
            "fontWeight": "700"
          }
        ],
        "headline-lg-mobile": [
          "28px",
          {
            "lineHeight": "36px",
            "fontWeight": "600"
          }
        ],
        "headline-sm": [
          "18px",
          {
            "lineHeight": "26px",
            "letterSpacing": "0.05em",
            "fontWeight": "600"
          }
        ],
        "stat-numeric": [
          "22px",
          {
            "lineHeight": "28px",
            "letterSpacing": "0.02em",
            "fontWeight": "700"
          }
        ],
        "body-lg": [
          "16px",
          {
            "lineHeight": "24px",
            "fontWeight": "400"
          }
        ],
        "display-hero-mobile": [
          "36px",
          {
            "lineHeight": "44px",
            "letterSpacing": "-0.01em",
            "fontWeight": "700"
          }
        ],
        "body-sm": [
          "12px",
          {
            "lineHeight": "16px",
            "fontWeight": "400"
          }
        ]
      }
    }
  }
};
