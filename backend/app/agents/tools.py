import os
import subprocess
import shlex
import uuid
import json
from pathlib import Path
from langchain_core.tools import tool

WHITELISTED_COMMANDS = [
    "ls", "cat", "head", "tail", "wc", "grep", "find", "tree",
    "git", "echo", "pwd", "date", "which", "file", "diff",
    "mkdir", "cp", "mv", "touch", "sort", "uniq", "sed", "awk",
    "python", "python3", "node", "npm", "pip",
]


def _validate_path(path: str, allowed_dirs: list[str]) -> str:
    resolved = str(Path(path).resolve())
    for allowed in allowed_dirs:
        allowed_resolved = str(Path(allowed).resolve())
        if resolved.startswith(allowed_resolved):
            return resolved
    raise PermissionError(f"Access denied: {path} is outside allowed directories")


def _validate_command(command: str) -> str:
    parts = shlex.split(command)
    if not parts:
        raise ValueError("Empty command")
    base_cmd = os.path.basename(parts[0])
    if base_cmd not in WHITELISTED_COMMANDS:
        raise PermissionError(
            f"Command '{base_cmd}' is not whitelisted. "
            f"Allowed: {', '.join(WHITELISTED_COMMANDS)}"
        )
    for dangerous in ["rm -rf /", "rm -rf ~", "> /dev/", "| rm", "; rm"]:
        if dangerous in command:
            raise PermissionError(f"Dangerous command pattern detected")
    return command


def create_filesystem_tools(allowed_dirs: list[str]) -> list:
    @tool
    def read_file(file_path: str) -> str:
        """Read the contents of a file. Returns the file content as a string."""
        validated = _validate_path(file_path, allowed_dirs)
        try:
            with open(validated, "r") as f:
                content = f.read()
            if len(content) > 50000:
                return content[:50000] + f"\n\n[TRUNCATED - file is {len(content)} chars total]"
            return content
        except Exception as e:
            return f"Error reading file: {e}"

    @tool
    def write_file(file_path: str, content: str) -> str:
        """Write content to a file. Creates the file if it doesn't exist, overwrites if it does."""
        validated = _validate_path(file_path, allowed_dirs)
        try:
            os.makedirs(os.path.dirname(validated), exist_ok=True)
            with open(validated, "w") as f:
                f.write(content)
            return f"Successfully wrote {len(content)} chars to {file_path}"
        except Exception as e:
            return f"Error writing file: {e}"

    @tool
    def edit_file(file_path: str, old_text: str, new_text: str) -> str:
        """Replace a specific text snippet in a file. The old_text must match exactly."""
        validated = _validate_path(file_path, allowed_dirs)
        try:
            with open(validated, "r") as f:
                content = f.read()
            if old_text not in content:
                return f"Error: old_text not found in {file_path}"
            count = content.count(old_text)
            if count > 1:
                return f"Error: old_text appears {count} times - provide more context to make it unique"
            updated = content.replace(old_text, new_text, 1)
            with open(validated, "w") as f:
                f.write(updated)
            return f"Successfully edited {file_path}"
        except Exception as e:
            return f"Error editing file: {e}"

    @tool
    def list_directory(directory_path: str) -> str:
        """List files and directories at the given path. Shows type and size."""
        validated = _validate_path(directory_path, allowed_dirs)
        try:
            entries = []
            for entry in sorted(os.scandir(validated), key=lambda e: e.name):
                if entry.name.startswith("."):
                    continue
                if entry.is_dir():
                    entries.append(f"[DIR]  {entry.name}/")
                else:
                    size = entry.stat().st_size
                    entries.append(f"[FILE] {entry.name} ({_format_size(size)})")
            if not entries:
                return f"Directory {directory_path} is empty"
            return "\n".join(entries)
        except Exception as e:
            return f"Error listing directory: {e}"

    @tool
    def search_files(directory_path: str, pattern: str) -> str:
        """Search for files matching a pattern (glob) in a directory recursively."""
        validated = _validate_path(directory_path, allowed_dirs)
        try:
            matches = list(Path(validated).rglob(pattern))
            if not matches:
                return f"No files matching '{pattern}' found in {directory_path}"
            results = []
            for m in matches[:50]:
                rel = m.relative_to(validated)
                results.append(str(rel))
            output = "\n".join(results)
            if len(matches) > 50:
                output += f"\n\n... and {len(matches) - 50} more matches"
            return output
        except Exception as e:
            return f"Error searching: {e}"

    @tool
    def search_content(directory_path: str, search_term: str) -> str:
        """Search for a text pattern within files in a directory. Returns matching lines with file paths."""
        validated = _validate_path(directory_path, allowed_dirs)
        try:
            result = subprocess.run(
                ["grep", "-rn", "--include=*", "-l", search_term, validated],
                capture_output=True, text=True, timeout=30
            )
            if not result.stdout.strip():
                return f"No files containing '{search_term}' found"
            files = result.stdout.strip().split("\n")[:20]
            output_lines = []
            for filepath in files:
                rel = os.path.relpath(filepath, validated)
                lines_result = subprocess.run(
                    ["grep", "-n", search_term, filepath],
                    capture_output=True, text=True, timeout=10
                )
                matching = lines_result.stdout.strip().split("\n")[:3]
                output_lines.append(f"\n{rel}:")
                for line in matching:
                    output_lines.append(f"  {line}")
            return "\n".join(output_lines)
        except Exception as e:
            return f"Error searching content: {e}"

    @tool
    def run_command(command: str, working_directory: str = "") -> str:
        """Run a whitelisted shell command. Only certain commands are allowed for safety."""
        _validate_command(command)
        cwd = None
        if working_directory:
            cwd = _validate_path(working_directory, allowed_dirs)
        elif allowed_dirs:
            cwd = allowed_dirs[0]
        try:
            result = subprocess.run(
                command, shell=True, capture_output=True, text=True,
                timeout=60, cwd=cwd
            )
            output = ""
            if result.stdout:
                output += result.stdout
            if result.stderr:
                output += f"\nSTDERR:\n{result.stderr}"
            if result.returncode != 0:
                output += f"\nExit code: {result.returncode}"
            if len(output) > 20000:
                output = output[:20000] + "\n[TRUNCATED]"
            return output or "(no output)"
        except subprocess.TimeoutExpired:
            return "Error: Command timed out after 60 seconds"
        except Exception as e:
            return f"Error running command: {e}"

    return [read_file, write_file, edit_file, list_directory, search_files, search_content, run_command]


def create_confirmation_tools(allowed_dirs: list[str], pending_actions: dict | None = None) -> list:
    """Tools that return proposed actions instead of executing them.

    If pending_actions dict is provided, actions are stored there for later approval.
    """
    if pending_actions is None:
        pending_actions = {}

    @tool
    def read_file(file_path: str) -> str:
        """Read the contents of a file. Returns the file content as a string."""
        validated = _validate_path(file_path, allowed_dirs)
        try:
            with open(validated, "r") as f:
                content = f.read()
            if len(content) > 50000:
                return content[:50000] + f"\n\n[TRUNCATED - file is {len(content)} chars total]"
            return content
        except Exception as e:
            return f"Error reading file: {e}"

    @tool
    def list_directory(directory_path: str) -> str:
        """List files and directories at the given path."""
        validated = _validate_path(directory_path, allowed_dirs)
        try:
            entries = []
            for entry in sorted(os.scandir(validated), key=lambda e: e.name):
                if entry.name.startswith("."):
                    continue
                if entry.is_dir():
                    entries.append(f"[DIR]  {entry.name}/")
                else:
                    size = entry.stat().st_size
                    entries.append(f"[FILE] {entry.name} ({_format_size(size)})")
            return "\n".join(entries) or "(empty directory)"
        except Exception as e:
            return f"Error: {e}"

    @tool
    def search_files(directory_path: str, pattern: str) -> str:
        """Search for files matching a pattern (glob) in a directory recursively."""
        validated = _validate_path(directory_path, allowed_dirs)
        try:
            matches = list(Path(validated).rglob(pattern))[:50]
            if not matches:
                return f"No files matching '{pattern}'"
            return "\n".join(str(m.relative_to(validated)) for m in matches)
        except Exception as e:
            return f"Error: {e}"

    @tool
    def search_content(directory_path: str, search_term: str) -> str:
        """Search for a text pattern within files in a directory."""
        validated = _validate_path(directory_path, allowed_dirs)
        try:
            result = subprocess.run(
                ["grep", "-rn", search_term, validated],
                capture_output=True, text=True, timeout=30
            )
            if not result.stdout.strip():
                return f"No matches for '{search_term}'"
            lines = result.stdout.strip().split("\n")[:30]
            return "\n".join(
                os.path.relpath(l.split(":")[0], validated) + ":" + ":".join(l.split(":")[1:])
                for l in lines
            )
        except Exception as e:
            return f"Error: {e}"

    def _store_pending(action_type: str, details: dict, agent_id: str = "") -> str:
        action_id = str(uuid.uuid4())[:8]
        pending_actions[action_id] = {
            "action_id": action_id,
            "action_type": action_type,
            "agent_id": agent_id,
            "details": details,
        }
        approval_block = json.dumps({
            "pending_approval": True,
            "action_id": action_id,
            "action_type": action_type,
            "details": {k: (v[:500] + "..." if isinstance(v, str) and len(v) > 500 else v) for k, v in details.items()},
        })
        return f"[PENDING_APPROVAL]{approval_block}[/PENDING_APPROVAL]"

    @tool
    def propose_write_file(file_path: str, content: str) -> str:
        """Propose writing content to a file. The action will be queued for user approval."""
        _validate_path(file_path, allowed_dirs)
        return _store_pending("write_file", {"file_path": file_path, "content": content})

    @tool
    def propose_edit_file(file_path: str, old_text: str, new_text: str) -> str:
        """Propose editing a file. The action will be queued for user approval."""
        _validate_path(file_path, allowed_dirs)
        return _store_pending("edit_file", {"file_path": file_path, "old_text": old_text, "new_text": new_text})

    @tool
    def propose_run_command(command: str, working_directory: str = "") -> str:
        """Propose running a shell command. The action will be queued for user approval."""
        _validate_command(command)
        if working_directory:
            _validate_path(working_directory, allowed_dirs)
        return _store_pending("run_command", {"command": command, "working_directory": working_directory})

    return [read_file, list_directory, search_files, search_content, propose_write_file, propose_edit_file, propose_run_command]


def _format_size(size: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"
