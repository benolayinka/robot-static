export function getQuery() {
	return Object.fromEntries(new URLSearchParams(window.location.search).entries());
}