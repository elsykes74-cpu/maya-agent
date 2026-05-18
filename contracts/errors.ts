function appError(status: number, message: string) {
	return { tag: "app_error" as const, status, message };
}

export const Errors = {
	badRequest: (msg: string) => appError(400, msg),
	unauthorized: (msg: string) => appError(401, msg),
	forbidden: (msg: string) => appError(403, msg),
	notFound: (msg: string) => appError(404, msg),
	internal: (msg: string) => appError(500, msg),
};
