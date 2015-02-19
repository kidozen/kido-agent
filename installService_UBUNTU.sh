#! /bin/sh
DIR=current-dir	
NODE_PATH=node-path
PID=/var/run/kido-agent.pid
PROCESS_PATH=process-path
case "$1" in
      start)
                echo "starting kido-agent"
                start-stop-daemon --start --name kido-agent --chdir $DIR --startas $NODE_PATH/node $PROCESS_PATH/process > output.txt 2> err.txt &
                echo $! > $PID
            ;;
      stop)
                echo "stopping kido-agent"
                start-stop-daemon --stop --quiet --pidfile $PID

            ;;
esac
exit 0