const colorLiterals = [
  '/^#(?:[\\da-f]{3,4}|[\\da-f]{6}|[\\da-f]{8})$/i',
  '/^(?:rgba?|hsla?)\\s*\\(/i',
  '/^(?:aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen)$/i',
];

export default {
  extends: ['stylelint-config-standard'],
  ignoreFiles: ['src/styles/tokens.css'],
  rules: {
    'selector-class-pattern': '^[a-z][a-zA-Z0-9]*$',
    'keyframes-name-pattern': '^[a-z][a-zA-Z0-9]*$',
    'no-descending-specificity': null,
    'at-rule-no-unknown': [true, { ignoreAtRules: ['custom-media'] }],
    'declaration-property-value-disallowed-list': {
      '/.*/': [
        ...colorLiterals,
        '/^(?<![\\d.])(?!(?:0|1)px$)\\d+(?:\\.\\d+)?px$/i',
      ],
    },
  },
};
