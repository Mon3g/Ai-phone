export function registerJsonBodyParser(fastify) {
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });
}
