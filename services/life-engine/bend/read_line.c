// Transport boundary only. A persistent worker processes one bounded job at a
// time; blocking stdin does not hold up the Node HTTP server or another worker.
Term read_line_run(Env e, Term* f, IoWork* w) {
  char line[4098];
  if (fgets(line, sizeof(line), stdin) == NULL) exit(0);
  size_t n = strlen(line);
  if (n == 0 || line[n - 1] != '\n') exit(2);
  return io_str(e, line, n - 1);
}
static void __attribute__((constructor)) read_line_use(void) {
  setvbuf(stdout, NULL, _IONBF, 0);
  io_eff(CID_READ_LINE, read_line_run, 0);
}
