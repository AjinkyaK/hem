"""Command line interface for running the Resume Tailor."""

import argparse
import asyncio
import sys
from pathlib import Path

from hem.graph import graph


async def run_tailor(job_input: str, resume_input: str):
    """Run the resume tailor workflow asynchronously with human review."""
    thread_config = {"configurable": {"thread_id": "cli_run"}}
    initial_state = {
        "job_posting": job_input,
        "base_resume": resume_input,
    }

    print("🚀 Starting Hem...")
    async for event in graph.astream(initial_state, thread_config):
        for node_name, _output in event.items():
            print(f"✓ Node [{node_name}] finished.")

    # Check for interrupts
    state = await graph.aget_state(thread_config)
    while state.next:
        for task in state.tasks:
            for interrupt in task.interrupts:
                print(f"\n{interrupt.value}")
                feedback = (await asyncio.to_thread(input, "\nYour response: ")).strip()
                await graph.aupdate_state(
                    thread_config,
                    {"user_feedback": feedback},
                    as_node="human_review",
                )
        async for event in graph.astream(None, thread_config):
            for node_name, _output in event.items():
                print(f"✓ Node [{node_name}] finished.")
        state = await graph.aget_state(thread_config)

    print("\n🎉 Resume tailoring completed successfully!")


def main():
    """Main CLI entrypoint."""
    parser = argparse.ArgumentParser(description="Hem CLI")
    parser.add_argument(
        "--job",
        "-j",
        required=True,
        help="Job posting URL or path to text file containing job posting",
    )
    parser.add_argument(
        "--resume",
        "-r",
        required=True,
        help="Path to markdown/text file containing base resume",
    )

    args = parser.parse_args()

    # Read job input
    job_path = Path(args.job)
    if job_path.exists() and job_path.is_file():
        job_content = job_path.read_text(encoding="utf-8")
    else:
        job_content = args.job

    # Read resume input
    resume_path = Path(args.resume)
    if not resume_path.exists() or not resume_path.is_file():
        print(f"Error: Resume file '{args.resume}' does not exist.", file=sys.stderr)
        sys.exit(1)
    resume_content = resume_path.read_text(encoding="utf-8")

    asyncio.run(run_tailor(job_content, resume_content))


if __name__ == "__main__":
    main()
