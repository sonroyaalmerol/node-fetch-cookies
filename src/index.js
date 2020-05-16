const _fetch = require("node-fetch");
const CookieJar = require("./cookie-jar.js");
const Cookie = require("./cookie.js");
const { paramError, CookieParseError } = require("./errors.js");

const __fetch = async (cookieJars, url, options) => {
    let cookies = "";
    const addValidFromJars = jars => {
        // since multiple cookie jars can be passed, filter duplicates by using a set of cookie names
        const set = new Set();
        jars.flatMap(jar => [...jar.cookiesValidForRequest(url)])
            .forEach(cookie => {
                if(set.has(cookie.name))
                    return;
                set.add(cookie.name);
                cookies += cookie.serialize() + "; ";
            });
    };
    if(cookieJars) {
        if(Array.isArray(cookieJars) && cookieJars.every(c => c instanceof CookieJar))
            addValidFromJars(cookieJars.filter(jar => jar.flags.includes("r")));
        else if(cookieJars instanceof CookieJar)
            if(cookieJars.flags.includes("r"))
                addValidFromJars([cookieJars]);
        else
            throw paramError("First", "cookieJars", "fetch", ["CookieJar", "[CookieJar]"]);
    }
    if(cookies) {
        if(!options)
            options = {};
        if(!options.headers)
            options.headers = {};
        options.headers.cookie = cookies.slice(0, -2);
    }
    var opts = { ...options, redirect: 'manual' }
    var result = null
    if (typeof navigator != 'undefined' && navigator.product == 'ReactNative') {
        // I'm in react-native
        result = await fetch(url, opts);
    } else {
        result = await _fetch(url, opts);
    }
    // I cannot use headers.get() here because it joins the cookies to a string
    cookies = result.headers[Object.getOwnPropertySymbols(result.headers)[0]]["set-cookie"];
    if(cookies && cookieJars) {
        if(Array.isArray(cookieJars)) {
            cookieJars
                .filter(jar => jar.flags.includes("w"))
                .forEach(jar => cookies.forEach(c => jar.addCookie(c, url)));
        }
        else if(cookieJars instanceof CookieJar && cookieJars.flags.includes("w")) {
            cookies.forEach(c => {
                cookieJars.addCookie(c, url)
            });
        }
    }
    const isRedirect = (result.status === 303 || ((result.status === 301 || result.status === 302)))

    if (isRedirect && options.redirect !== 'manual' && options.follow !== 0) {
        const optsForGet = Object.assign({}, {
            method: 'GET',
            body: null,
            // Since the "follow" flag is not relevant for node-fetch in this case,
            // we'll hijack it for our internal bookkeeping.
            follow: options.follow !== undefined ? options.follow - 1 : undefined
        })
        return __fetch(cookieJars, result.headers.get('location'), optsForGet)
    } else {
        return result
    }
}

module.exports = {fetch: __fetch, CookieJar, Cookie, CookieParseError};
