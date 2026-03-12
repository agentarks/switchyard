export class SwitchyardError extends Error {
  readonly code: string;

  constructor(message: string, code = "SWITCHYARD_ERROR") {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ConfigError extends SwitchyardError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
  }
}

export class InitError extends SwitchyardError {
  constructor(message: string) {
    super(message, "INIT_ERROR");
  }
}

export class WorktreeError extends SwitchyardError {
  constructor(message: string) {
    super(message, "WORKTREE_ERROR");
  }
}

export class RuntimeError extends SwitchyardError {
  constructor(message: string) {
    super(message, "RUNTIME_ERROR");
  }
}

export class SlingError extends SwitchyardError {
  constructor(message: string) {
    super(message, "SLING_ERROR");
  }
}

export class StopError extends SwitchyardError {
  constructor(message: string) {
    super(message, "STOP_ERROR");
  }
}

export class MailError extends SwitchyardError {
  constructor(message: string) {
    super(message, "MAIL_ERROR");
  }
}

export class EventsError extends SwitchyardError {
  constructor(message: string) {
    super(message, "EVENTS_ERROR");
  }
}

export class LogsError extends SwitchyardError {
  constructor(message: string) {
    super(message, "LOGS_ERROR");
  }
}

export class StatusError extends SwitchyardError {
  constructor(message: string) {
    super(message, "STATUS_ERROR");
  }
}

export class MergeError extends SwitchyardError {
  constructor(message: string) {
    super(message, "MERGE_ERROR");
  }
}
