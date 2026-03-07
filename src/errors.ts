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
