const url = require("url");
const Cookie = require("./cookie.js");
const { paramError, CookieParseError } = require("./errors.js");
var RNFS = null

try {
    RNFS = require("react-native-fs");
} catch (err) {
    RNFS = null
}

class CookieJar {
    constructor(file, flags = "rw", cookies, cookieIgnoreCallback) {
        if(file && typeof file !== "string")
            throw paramError("Second", "file", "new CookieJar()", "string");
        if(typeof flags !== "string")
            throw paramError("First", "flags", "new CookieJar()", "string");
        if(Array.isArray(cookies)) {
            if(!cookies.every(c => c instanceof Cookie))
                throw paramError("Third", "cookies", "new CookieJar()", "[Cookie]");
            cookies.forEach(cookie => this.addCookie(cookie));
        }
        else if(cookies instanceof Cookie)
            this.addCookie(cookies);
        else if(cookies)
            throw paramError("Third", "cookies", "new CookieJar()", ["[Cookie]", "Cookie"]);
        if(cookieIgnoreCallback && typeof cookieIgnoreCallback !== "function")
            throw paramError("Fourth", "cookieIgnoreCallback", "new CookieJar()", "function");
        this.file = file;
        this.flags = flags;
        this.cookies = new Map();
        this.cookieIgnoreCallback = cookieIgnoreCallback;
    }
    addCookie(cookie, fromURL) {
        if(typeof cookie === "string") {
            try {
                cookie = new Cookie(cookie, fromURL);
            }
            catch(error) {
                if(error instanceof CookieParseError) {
                    if(this.cookieIgnoreCallback)
                        this.cookieIgnoreCallback(cookie, error.message);
                    return false;
                }
                throw error;
            }
        }
        else if(!(cookie instanceof Cookie))
            throw paramError("First", "cookie", "CookieJar.addCookie()", ["string", "Cookie"]);
        if(!this.cookies.get(cookie.domain))
            this.cookies.set(cookie.domain, new Map());
        this.cookies.get(cookie.domain).set(cookie.name, cookie);
        return true;
    }
    domains() {
        return this.cookies.keys();
    }
    *cookiesDomain(domain) {
        for(const cookie of (this.cookies.get(domain) || []).values())
            yield cookie;
    }
    *cookiesValid(withSession) {
        for(const cookie of this.cookiesAll())
            if(!cookie.hasExpired(!withSession))
                yield cookie;
    }
    *cookiesAll() {
        for(const domain of this.domains())
            yield* this.cookiesDomain(domain);
    }
    *cookiesValidForRequest(requestURL) {
        const namesYielded = new Set(),
              domains = url
                .parse(requestURL)
                .hostname
                .split(".")
                .map((_, i, a) => a.slice(i).join("."))
                .slice(0, -1);
        for(const domain of domains) {
            for(const cookie of this.cookiesDomain(domain)) {
                if(cookie.isValidForRequest(requestURL)
                && !namesYielded.has(cookie.name)) {
                    namesYielded.add(cookie.name);
                    yield cookie;
                }
            }
        }
    }
    deleteExpired(sessionEnded) {
        const validCookies = [...this.cookiesValid(!sessionEnded)];
        this.cookies = new Map();
        validCookies.forEach(c => this.addCookie(c));
    }
    async load(file = this.file) {
        if (RNFS) {
            if(typeof file !== "string")
                throw new Error("No file has been specified for this cookie jar!");
            JSON.parse(await RNFS.readFile(`${RNFS.DocumentDirectoryPath}/${file}`)).forEach(c => this.addCookie(Cookie.fromObject(c)));
        } else {
            throw new Error("Failed to load RNFS!");
        }
    }
    async save(file = this.file) {
        if (RNFS) {
            if(typeof file !== "string")
                throw new Error("No file has been specified for this cookie jar!");
            // only save cookies that haven't expired
            await RNFS.writeFile(`${RNFS.DocumentDirectoryPath}/${this.file}`, JSON.stringify([...this.cookiesValid(false)]))
        } else {
            throw new Error("Failed to load RNFS!");
        }
    }
};

module.exports = CookieJar