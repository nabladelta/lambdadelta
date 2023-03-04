export function getTimestampInSeconds() {
    return Math.floor(Date.now() / 1000)
}

// Rounded to 1000 seconds. This is the Thread-Epoch
export function getThreadEpoch () {
    return Math.floor(Date.now() / 1000000)
}
