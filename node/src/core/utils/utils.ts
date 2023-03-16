export function getTimestampInSeconds() {
    return Math.floor(Date.now() / 1000)
}

// Rounded to 1000 seconds. This is the Thread-Epoch
export function getThreadEpoch() {
    return Math.floor(Date.now() / 1000000)
}

export function difference(a: Set<any> | string[], b: Set<any> | string[]) {
    const _difference = new Set(a)
    const setB = new Set(b)
    for (const elem of setB) {
      _difference.delete(elem)
    }
    return _difference
}

export function keySetFormat(a: Set<string> | string[]) {
    return Array.from(a).map(s => s.slice(-6))
}