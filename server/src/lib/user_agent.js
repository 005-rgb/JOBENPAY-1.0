/**
 * Lightweight, zero-dependency User-Agent parser.
 */
export function parseUserAgent(uaString = '') {
  if (!uaString || typeof uaString !== 'string') {
    return {
      browser: 'Web Browser',
      os: 'Unknown Device',
      label: 'Web Browser',
    };
  }

  let browser = 'Web Browser';
  if (/edg/i.test(uaString)) {
    browser = 'Microsoft Edge';
  } else if (/chrome|crios/i.test(uaString)) {
    browser = 'Google Chrome';
  } else if (/firefox|fxios/i.test(uaString)) {
    browser = 'Mozilla Firefox';
  } else if (/safari/i.test(uaString) && !/chrome/i.test(uaString)) {
    browser = 'Apple Safari';
  } else if (/opera|opr/i.test(uaString)) {
    browser = 'Opera';
  }

  let os = 'Unknown OS';
  if (/windows nt 10/i.test(uaString)) {
    os = 'Windows 10/11';
  } else if (/windows/i.test(uaString)) {
    os = 'Windows';
  } else if (/macintosh|mac os x/i.test(uaString)) {
    os = 'macOS';
  } else if (/iphone/i.test(uaString)) {
    os = 'iOS (iPhone)';
  } else if (/ipad/i.test(uaString)) {
    os = 'iOS (iPad)';
  } else if (/android/i.test(uaString)) {
    os = 'Android';
  } else if (/linux/i.test(uaString)) {
    os = 'Linux';
  }

  return {
    browser,
    os,
    label: `${browser} on ${os}`,
  };
}

export default { parseUserAgent };
