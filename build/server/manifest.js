const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["robots.txt"]),
	mimeTypes: {".txt":"text/plain"},
	_: {
		client: {start:"_app/immutable/entry/start.D7COM-G0.js",app:"_app/immutable/entry/app.By6rPzbS.js",imports:["_app/immutable/entry/start.D7COM-G0.js","_app/immutable/chunks/tim91OU0.js","_app/immutable/chunks/BlsAYwGw.js","_app/immutable/chunks/CUg8qQUu.js","_app/immutable/entry/app.By6rPzbS.js","_app/immutable/chunks/BlsAYwGw.js","_app/immutable/chunks/CBpHryqH.js","_app/immutable/chunks/Cp8qDwIr.js","_app/immutable/chunks/CUg8qQUu.js","_app/immutable/chunks/BOmlDdob.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./chunks/0-zz3fkyWC.js')),
			__memo(() => import('./chunks/1-CEgWv23-.js')),
			__memo(() => import('./chunks/2-Da9Z6yCv.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/health",
				pattern: /^\/health\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('./chunks/_server.ts-D7jsDOft.js'))
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();

const prerendered = new Set([]);

const base = "";

export { base, manifest, prerendered };
//# sourceMappingURL=manifest.js.map
