# Testing

Whoever writes the code does not write its tests. After adding or changing behaviour in `src/`,
delegate the tests to the `test-writer` subagent. This is a standing request to use it.

Give it:

- the files and functions changed
- what the change is supposed to do, including how errors and invalid input should be handled
- constraints or risks you know about

Describe intended behaviour, not just the implementation. Do not write or edit `*.test.ts` yourself.
When it reports a bug, fix the source and send it back to the same subagent.

Not needed for changes with no behaviour to test (docs, comments, formatting, renames).
If you are the `test-writer` subagent, write the tests yourself.
