#! /bin/sh

# Path where kido-agent config.json file is locate
DIR=current-dir
# Full path to node binary
NODE_PATH=node-path

PROCESS_PATH=process-path
PID=/var/run/kido-agent.pid

case "$1" in
      start)
                echo "starting kido-agent"
                start-stop-daemon --start --name kido-agent --chdir $DIR --startas $NODE_PATH $PROCESS_PATH/process > output.txt 2> err.txt &
                echo $! > $PID
            ;;
      stop)
                echo "stopping kido-agent"
                start-stop-daemon --stop --quiet --pidfile $PID

            ;;
esac
exit 0