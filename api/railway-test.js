export default {
  async fetch(request) {
    return new Response("Railway test OK", {
      headers: { "content-type": "text/plain" }
    });
  }
};
