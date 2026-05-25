/* hangul-romanization 1.0.1 — browser bundle
 * MIT License Copyright 2016 Daniel Imms (http://www.growingwiththeweb.com) */
(function (global) {
  var RRK = {
    vowels: ['a','ae','ya','yee','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'],
    consonants: {
      initial: ['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'],
      final:   ['','k','k','kt','n','nt','nh','t','l','lk','lm','lp','lt','lt','lp','lh','m','p','pt','t','tt','ng','t','t','k','t','p','h']
    }
  };
  var OFFSET = 44032, MAX = 55215;
  function convertChar(ch) {
    var code = ch.charCodeAt(0);
    if (code < OFFSET || code >= MAX) return ch;
    var u = code - OFFSET;
    var fin = u % RRK.consonants.final.length; u = (u - fin) / RRK.consonants.final.length;
    var vow = u % RRK.vowels.length;           u = (u - vow) / RRK.vowels.length;
    return RRK.consonants.initial[u] + RRK.vowels[vow] + RRK.consonants.final[fin];
  }
  global.hangulRomanization = {
    convert: function (text) { return text.split('').map(convertChar).join(''); }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
