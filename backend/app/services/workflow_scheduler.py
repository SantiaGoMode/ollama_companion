import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from app.database import async_session
from app.models.workflow import WorkflowModel
from app.services.workflow_service import get_all_workflows, execute_workflow
from sqlalchemy import select

logger = logging.getLogger(__name__)

# Track when each workflow was last triggered to avoid duplicates
_last_triggered: dict[str, datetime] = {}
_scheduler_task: Optional[asyncio.Task] = None


def _cron_matches_now(cron_expr: str, now: datetime, window_seconds: int = 60) -> bool:
    """Check if a cron expression matches the current time within a window."""
    try:
        from croniter import croniter
        cron = croniter(cron_expr, now - timedelta(seconds=window_seconds))
        next_time = cron.get_next(datetime)
        return next_time <= now
    except Exception:
        return False


async def _check_schedules():
    """Check all workflows for scheduled triggers."""
    try:
        async with async_session() as db:
            workflows = await get_all_workflows(db)
            now = datetime.now(timezone.utc)

            for workflow in workflows:
                if not workflow.enabled or not workflow.schedule:
                    continue

                # Check if already triggered recently (within 90 seconds)
                last = _last_triggered.get(workflow.id)
                if last and (now - last).total_seconds() < 90:
                    continue

                if _cron_matches_now(workflow.schedule, now):
                    logger.info(f"Scheduled trigger for workflow '{workflow.name}' (id={workflow.id})")
                    _last_triggered[workflow.id] = now

                    # Run the workflow execution, consuming events (we don't stream to anyone)
                    try:
                        async for event in execute_workflow(
                            db=db,
                            workflow=workflow,
                            initial_input="",
                            trigger="scheduled",
                        ):
                            # Log key events
                            if event.get("type") == "execution_completed":
                                logger.info(f"Scheduled workflow '{workflow.name}' completed")
                            elif event.get("type") == "execution_failed":
                                logger.warning(f"Scheduled workflow '{workflow.name}' failed: {event.get('error')}")
                    except Exception as e:
                        logger.error(f"Error executing scheduled workflow '{workflow.name}': {e}")

    except Exception as e:
        logger.error(f"Scheduler check error: {e}")


async def _cleanup_expired_actions():
    """Remove expired pending actions from the database."""
    try:
        from app.services.pending_action_service import cleanup_expired
        async with async_session() as db:
            await cleanup_expired(db)
    except Exception as e:
        logger.error("Pending action cleanup error: %s", e)


_cleanup_counter = 0


async def _scheduler_loop():
    """Background loop that checks schedules every 30 seconds."""
    global _cleanup_counter
    while True:
        await _check_schedules()
        _cleanup_counter += 1
        if _cleanup_counter % 20 == 0:  # Every ~10 minutes
            await _cleanup_expired_actions()
        await asyncio.sleep(30)


def start_scheduler():
    """Start the background scheduler task."""
    global _scheduler_task
    if _scheduler_task is None or _scheduler_task.done():
        _scheduler_task = asyncio.create_task(_scheduler_loop())
        logger.info("Workflow scheduler started")


def stop_scheduler():
    """Stop the background scheduler task."""
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        logger.info("Workflow scheduler stopped")
    _scheduler_task = None
